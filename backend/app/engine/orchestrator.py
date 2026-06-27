import time
import multiprocessing as mp
import threading
from collections import deque

from app.database import SessionLocal
from app.models.account import Account, SlaveConfig
from app.engine.nt8_worker import nt8_master_monitor, nt8_slave_executor
from app.utils.logger import get_logger

logger = get_logger("hydrax.orchestrator")

_copier_running = False
_copier_start_time: float | None = None
_active_masters = 0
_active_slaves = 0
_worker_status: dict[str, dict] = {}

MAX_RESTARTS_PER_MINUTE = 3
RESTART_WINDOW_SECONDS = 60


def set_copier_state(running: bool, masters: int = 0, slaves: int = 0):
    global _copier_running, _active_masters, _active_slaves, _copier_start_time
    _copier_running = running
    _active_masters = masters
    _active_slaves = slaves
    _copier_start_time = time.time() if running else None


def get_copier_state():
    uptime = None
    if _copier_start_time:
        uptime = time.time() - _copier_start_time
    return {
        "running": _copier_running,
        "uptime_seconds": uptime,
        "active_masters": _active_masters,
        "active_slaves": _active_slaves,
        "workers": _worker_status.copy(),
    }


class CopierOrchestrator:
    def __init__(self):
        self._master_processes: dict[str, mp.Process] = {}
        self._slave_processes: dict[str, mp.Process] = {}
        self._slave_queues: dict[str, mp.Queue] = {}
        self._master_stop_flags: dict[str, mp.Event] = {}
        self._slave_stop_flags: dict[str, mp.Event] = {}
        self._event_queue: mp.Queue | None = None
        self._running = False
        self._lock = threading.Lock()

        self._master_configs: dict[str, dict] = {}
        self._slave_configs: dict[str, dict] = {}
        self._restart_timestamps: dict[str, deque] = {}

    @property
    def running(self) -> bool:
        return self._running

    def start(self):
        with self._lock:
            if self._running:
                return {"ok": False, "message": "Already running"}

            self._running = True
            self._clear_state()
            self._event_queue = mp.Queue()

            db = SessionLocal()
            try:
                masters = db.query(Account).filter(Account.role == "MASTER", Account.active == True).all()
                slaves = db.query(Account).filter(Account.role == "SLAVE", Account.active == True).all()

                if not masters:
                    self._running = False
                    return {"ok": False, "message": "No hay cuentas master activas"}

                for slave in slaves:
                    config = db.query(SlaveConfig).filter(SlaveConfig.account_id == slave.id).first()
                    if not config:
                        continue

                    q = mp.Queue()
                    stop_flag = mp.Event()
                    self._slave_queues[slave.id] = q
                    self._slave_stop_flags[slave.id] = stop_flag

                    slave_cfg = {
                        "account_id": slave.id, "name": slave.name, "login": slave.login,
                        "bridge_host": slave.bridge_host, "bridge_port": slave.bridge_port,
                        "risk_mode": config.risk_mode.value if config.risk_mode else "FIXED",
                        "risk_percent": config.risk_percent or 0.5, "risk_usd": config.risk_usd or 50.0,
                        "fixed_contracts": config.fixed_contracts or 1, "lot_multiplier": config.lot_multiplier or 1.0,
                        "max_contracts": config.max_contracts or 100, "max_positions": config.max_positions or 100,
                        "autocopy_enable": config.autocopy_enable if config.autocopy_enable is not None else True,
                        "copy_sl": config.copy_sl if config.copy_sl is not None else True,
                        "copy_tp": config.copy_tp if config.copy_tp is not None else True,
                        "inverse_copy": config.inverse_copy or False, "delay_sec": config.delay_sec or 0.0,
                        "magic_number": config.magic_number or 0,
                    }
                    self._slave_configs[slave.id] = slave_cfg

                    p = mp.Process(
                        target=nt8_slave_executor,
                        args=(
                            slave.id, slave.name, slave.login, slave.bridge_host, slave.bridge_port,
                            slave_cfg["risk_mode"], slave_cfg["risk_percent"], slave_cfg["risk_usd"],
                            slave_cfg["fixed_contracts"], slave_cfg["lot_multiplier"],
                            slave_cfg["max_contracts"], slave_cfg["max_positions"],
                            slave_cfg["autocopy_enable"], slave_cfg["copy_sl"], slave_cfg["copy_tp"],
                            slave_cfg["inverse_copy"], slave_cfg["delay_sec"], slave_cfg["magic_number"],
                            q, stop_flag, self._event_queue,
                        ),
                        name=f"slave-{slave.id}",
                    )
                    p.start()
                    self._slave_processes[slave.id] = p
                    _worker_status[f"slave:{slave.name}"] = {"pid": p.pid, "alive": p.is_alive(), "account_id": slave.id}

                for master in masters:
                    stop_flag = mp.Event()
                    self._master_stop_flags[master.id] = stop_flag

                    master_cfg = {
                        "account_id": master.id, "name": master.name,
                        "bridge_host": master.bridge_host, "bridge_port": master.bridge_port,
                        "login": master.login, "poll_interval": master.poll_interval or 0.5,
                    }
                    self._master_configs[master.id] = master_cfg

                    p = mp.Process(
                        target=nt8_master_monitor,
                        args=(
                            master.id, master.name, master.bridge_host, master.bridge_port,
                            master.login, master.poll_interval or 0.5,
                            self._slave_queues, stop_flag, self._event_queue,
                        ),
                        name=f"master-{master.id}",
                    )
                    p.start()
                    self._master_processes[master.id] = p
                    _worker_status[f"master:{master.name}"] = {"pid": p.pid, "alive": p.is_alive(), "account_id": master.id}

            finally:
                db.close()

            set_copier_state(True, len(masters), len(slaves))
            threading.Thread(target=self._broadcast_events, daemon=True).start()
            threading.Thread(target=self._monitor_workers, daemon=True).start()
            return {"ok": True, "message": f"Started: {len(masters)} masters, {len(slaves)} slaves"}

    def stop(self):
        with self._lock:
            if not self._running:
                return
            self._running = False
            for flag in self._master_stop_flags.values():
                flag.set()
            for flag in self._slave_stop_flags.values():
                flag.set()
            for q in self._slave_queues.values():
                try:
                    q.put(None, timeout=0.1)
                except Exception:
                    pass
            for p in self._master_processes.values():
                if p.is_alive():
                    p.join(timeout=2)
                    if p.is_alive():
                        p.terminate()
            for p in self._slave_processes.values():
                if p.is_alive():
                    p.join(timeout=2)
                    if p.is_alive():
                        p.terminate()
            self._clear_state()
            _worker_status.clear()
            set_copier_state(False, 0, 0)

    def _clear_state(self):
        self._master_processes.clear()
        self._slave_processes.clear()
        self._slave_queues.clear()
        self._master_stop_flags.clear()
        self._slave_stop_flags.clear()
        self._event_queue = None
        self._master_configs.clear()
        self._slave_configs.clear()
        self._restart_timestamps.clear()

    def _can_restart(self, account_id: str) -> bool:
        now = time.time()
        if account_id not in self._restart_timestamps:
            self._restart_timestamps[account_id] = deque()
        timestamps = self._restart_timestamps[account_id]
        while timestamps and now - timestamps[0] > RESTART_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= MAX_RESTARTS_PER_MINUTE:
            return False
        timestamps.append(now)
        return True

    def _restart_master(self, account_id: str):
        cfg = self._master_configs.get(account_id)
        if not cfg:
            logger.error(f"Cannot restart master {account_id}: no config found")
            return

        if not self._can_restart(account_id):
            logger.error(f"Master {cfg.get('name', account_id)}: max restarts reached ({MAX_RESTARTS_PER_MINUTE}/min), giving up")
            return

        if not self._event_queue:
            logger.error(f"Cannot restart master {account_id}: event_queue is None")
            return

        logger.info(f"Restarting master: {cfg.get('name', account_id)} (attempt {len(self._restart_timestamps.get(account_id, deque()))})")

        stop_flag = mp.Event()
        self._master_stop_flags[account_id] = stop_flag

        try:
            p = mp.Process(
                target=nt8_master_monitor,
                args=(
                    cfg["account_id"], cfg["name"], cfg["bridge_host"], cfg["bridge_port"],
                    cfg["login"], cfg["poll_interval"],
                    self._slave_queues, stop_flag, self._event_queue,
                ),
                name=f"master-{account_id}",
            )
            p.start()
            self._master_processes[account_id] = p
            _worker_status[f"master:{cfg['name']}"] = {"pid": p.pid, "alive": p.is_alive(), "account_id": account_id}
            logger.info(f"Master restarted: {cfg.get('name', account_id)} PID={p.pid}")
        except Exception as e:
            logger.error(f"Failed to restart master {account_id}: {e}")

    def _restart_slave(self, account_id: str):
        cfg = self._slave_configs.get(account_id)
        if not cfg:
            logger.error(f"Cannot restart slave {account_id}: no config found")
            return

        if not self._can_restart(account_id):
            logger.error(f"Slave {cfg.get('name', account_id)}: max restarts reached ({MAX_RESTARTS_PER_MINUTE}/min), giving up")
            return

        if not self._event_queue:
            logger.error(f"Cannot restart slave {account_id}: event_queue is None")
            return

        logger.info(f"Restarting slave: {cfg.get('name', account_id)} (attempt {len(self._restart_timestamps.get(account_id, deque()))})")

        q = mp.Queue()
        stop_flag = mp.Event()

        if account_id in self._slave_queues:
            old_q = self._slave_queues[account_id]
            try:
                old_q.close()
                old_q.join_thread()
            except Exception:
                pass

        self._slave_queues[account_id] = q
        self._slave_stop_flags[account_id] = stop_flag

        try:
            p = mp.Process(
                target=nt8_slave_executor,
                args=(
                    cfg["account_id"], cfg["name"], cfg["login"],
                    cfg["bridge_host"], cfg["bridge_port"],
                    cfg["risk_mode"], cfg["risk_percent"], cfg["risk_usd"],
                    cfg["fixed_contracts"], cfg["lot_multiplier"],
                    cfg["max_contracts"], cfg["max_positions"],
                    cfg["autocopy_enable"], cfg["copy_sl"], cfg["copy_tp"],
                    cfg["inverse_copy"], cfg["delay_sec"], cfg["magic_number"],
                    q, stop_flag, self._event_queue,
                ),
                name=f"slave-{account_id}",
            )
            p.start()
            self._slave_processes[account_id] = p
            _worker_status[f"slave:{cfg['name']}"] = {"pid": p.pid, "alive": p.is_alive(), "account_id": account_id}
            logger.info(f"Slave restarted: {cfg.get('name', account_id)} PID={p.pid}")
        except Exception as e:
            logger.error(f"Failed to restart slave {account_id}: {e}")

    def _broadcast_events(self):
        import asyncio
        from app.ws.manager import manager as ws_manager
        while self._running:
            try:
                event = self._event_queue.get(timeout=1)
                if event is None:
                    continue
                try:
                    loop = asyncio.new_event_loop()
                    loop.run_until_complete(ws_manager.broadcast(event["type"], event.get("data", {})))
                    loop.close()
                except Exception:
                    pass
            except Exception:
                pass

    def _check_workers_alive(self):
        dead_masters = []
        dead_slaves = []

        for mid, p in list(self._master_processes.items()):
            alive = p.is_alive()
            for key, status in list(_worker_status.items()):
                if status.get("account_id") == mid:
                    _worker_status[key] = {**status, "alive": alive}
                    if not alive:
                        dead_masters.append(mid)
                    break

        for sid, p in list(self._slave_processes.items()):
            alive = p.is_alive()
            for key, status in list(_worker_status.items()):
                if status.get("account_id") == sid:
                    _worker_status[key] = {**status, "alive": alive}
                    if not alive:
                        dead_slaves.append(sid)
                    break

        return dead_masters, dead_slaves

    def _monitor_workers(self):
        while self._running:
            dead_masters, dead_slaves = self._check_workers_alive()

            for mid in dead_masters:
                logger.warning(f"Worker DOWN: master:{mid}")
                with self._lock:
                    if not self._running:
                        break
                    if mid in self._master_processes:
                        old_proc = self._master_processes.pop(mid, None)
                        if old_proc and old_proc.is_alive():
                            self._master_processes[mid] = old_proc
                            continue
                        old_flag = self._master_stop_flags.pop(mid, None)
                        if old_proc:
                            try:
                                old_proc.join(timeout=1)
                            except Exception:
                                pass
                    self._restart_master(mid)

            for sid in dead_slaves:
                logger.warning(f"Worker DOWN: slave:{sid}")
                with self._lock:
                    if not self._running:
                        break
                    if sid in self._slave_processes:
                        old_proc = self._slave_processes.pop(sid, None)
                        if old_proc and old_proc.is_alive():
                            self._slave_processes[sid] = old_proc
                            continue
                        if old_proc:
                            try:
                                old_proc.join(timeout=1)
                            except Exception:
                                pass
                    self._restart_slave(sid)

            time.sleep(5)


_orchestrator: CopierOrchestrator | None = None


def get_orchestrator() -> CopierOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = CopierOrchestrator()
    return _orchestrator
