"""Worker NinjaTrader 8 - monitor para masters y executor para slaves."""
import time
import multiprocessing as mp

from app.database import SessionLocal
from app.models.account import SlaveConfig
from app.engine.nt8_connector import NT8Connector
from app.engine.ticket_mapper import (
    reserve_pending, confirm_open, mark_pending_error, mark_closed, get_slave_ticket,
)
from app.engine.risk_calculator import (
    calculate_contracts_fixed, calculate_contracts_risk_percent,
    calculate_contracts_risk_usd, calculate_contracts_ratio,
    calculate_contracts_balance_prop,
)
from app.engine.command_router import is_slave_linked_to_master
from app.utils.logger import get_logger

logger = get_logger("hydrax.nt8")


def nt8_master_monitor(account_id: str, name: str, bridge_host: str, bridge_port: int,
                       login: str, poll_interval: float,
                       slave_queues: dict, stop_flag: mp.Event, event_queue: mp.Queue):
    display = name or f"nt8-master-{login}"
    conn = NT8Connector(bridge_host, bridge_port)

    if not conn.connect():
        logger.error(f"{display}: connection failed")
        return

    logger.info(f"{display}: connected to NT8 bridge")

    prev_positions = {}
    positions = conn.get_positions(login)
    for p in positions:
        pid = p.get("id", str(hash(str(p))))
        prev_positions[pid] = p
    logger.info(f"{display}: ignoring {len(prev_positions)} existing positions")

    prev_orders = {str(o.get("ticket", hash(str(o)))): o for o in conn.get_orders(login)}
    logger.info(f"{display}: ignoring {len(prev_orders)} existing orders")

    while not stop_flag.is_set():
        try:
            cur_positions = {}
            positions = conn.get_positions(login)
            for p in positions:
                pid = p.get("id", str(hash(str(p))))
                cur_positions[pid] = p

            for pid, p in cur_positions.items():
                if pid not in prev_positions:
                    direction = p.get("direction", "BUY")
                    symbol = p.get("symbol", "?")
                    contracts = p.get("contracts", 1)
                    logger.info(f"{display}: new position {pid} {symbol} {direction}")
                    cmd = {
                        "action": "OPEN",
                        "payload": {
                            "symbol": symbol,
                            "direction": direction,
                            "price": p.get("entry_price", 0),
                            "sl": p.get("sl", 0) or 0,
                            "tp": p.get("tp", 0) or 0,
                            "master_ticket": hash(pid) % 1000000,
                            "master_account_id": account_id,
                            "master_name": display,
                            "bridge_host": bridge_host,
                            "bridge_port": bridge_port,
                            "contracts": contracts,
                            "nt8_position_id": pid,
                        },
                    }
                    for q in slave_queues.values():
                        if not stop_flag.is_set():
                            q.put(cmd)
                    try:
                        event_queue.put({
                            "type": "position_open",
                            "data": {"master": display, "symbol": symbol,
                                     "direction": direction, "contracts": contracts, "ticket": pid},
                        })
                    except Exception:
                        pass

            for pid, p in prev_positions.items():
                if pid not in cur_positions:
                    logger.info(f"{display}: closed position {pid}")
                    cmd = {
                        "action": "CLOSE",
                        "payload": {
                            "position_ticket": hash(pid) % 1000000,
                            "symbol": p.get("symbol", "?"),
                            "direction": p.get("direction", "BUY"),
                            "contracts": p.get("contracts", 1),
                            "master_account_id": account_id,
                            "bridge_host": bridge_host,
                            "bridge_port": bridge_port,
                            "nt8_position_id": pid,
                        },
                    }
                    for q in slave_queues.values():
                        if not stop_flag.is_set():
                            q.put(cmd)
                    try:
                        event_queue.put({
                            "type": "position_close",
                            "data": {"master": display, "symbol": p.get("symbol", "?"), "ticket": pid},
                        })
                    except Exception:
                        pass

            for pid, cur in cur_positions.items():
                if pid in prev_positions:
                    prev = prev_positions[pid]
                    if abs((prev.get("sl", 0) or 0) - (cur.get("sl", 0) or 0)) > 0.01 or \
                       abs((prev.get("tp", 0) or 0) - (cur.get("tp", 0) or 0)) > 0.01:
                        logger.info(f"{display}: modify position {pid}")
                        cmd = {
                            "action": "MODIFY",
                            "payload": {
                                "position_ticket": hash(pid) % 1000000,
                                "symbol": cur.get("symbol", "?"),
                                "new_sl": cur.get("sl", 0) or 0,
                                "new_tp": cur.get("tp", 0) or 0,
                                "master_account_id": account_id,
                                "bridge_host": bridge_host,
                                "bridge_port": bridge_port,
                                "nt8_position_id": pid,
                            },
                        }
                        for q in slave_queues.values():
                            if not stop_flag.is_set():
                                q.put(cmd)

            prev_positions = cur_positions

            cur_orders = {str(o.get("ticket", hash(str(o)))): o for o in conn.get_orders(login)}
            for ot, o in cur_orders.items():
                if ot not in prev_orders:
                    logger.info(f"{display}: new pending order {ot} {o.get('symbol')} {o.get('type')} {o.get('direction')}")
                    try:
                        event_queue.put({
                            "type": "order_pending",
                            "data": {
                                "master": display,
                                "symbol": o.get("symbol"),
                                "type": o.get("type"),
                                "direction": o.get("direction"),
                                "quantity": o.get("quantity"),
                                "ticket": ot,
                            },
                        })
                    except Exception:
                        pass
            for ot, o in prev_orders.items():
                if ot not in cur_orders:
                    logger.info(f"{display}: order removed {ot}")
                    try:
                        event_queue.put({
                            "type": "order_removed",
                            "data": {"master": display, "ticket": ot},
                        })
                    except Exception:
                        pass
            prev_orders = cur_orders

            for _ in range(int(poll_interval * 10)):
                if stop_flag.is_set():
                    break
                time.sleep(0.1)

        except Exception as e:
            logger.error(f"{display}: error: {e}")
            break

    conn.disconnect()
    logger.info(f"{display}: monitor stopped")


def nt8_slave_executor(account_id: str, name: str, login: str, bridge_host: str, bridge_port: int,
                       risk_mode: str, risk_percent: float, risk_usd: float,
                       fixed_contracts: int, lot_multiplier: float, max_contracts: int,
                       max_positions: int, autocopy_enable: bool, copy_sl: bool,
                       copy_tp: bool, inverse_copy: bool, delay_sec: float,
                       magic_number: int, queue: mp.Queue, stop_flag: mp.Event,
                       event_queue: mp.Queue):
    display = name or f"nt8-slave"

    if not autocopy_enable:
        return

    conn = NT8Connector(bridge_host, bridge_port)
    if not conn.connect():
        logger.error(f"{display}: connection failed")
        return

    logger.info(f"{display}: connected to NT8 bridge")

    _config = {
        "risk_mode": risk_mode, "risk_percent": risk_percent, "risk_usd": risk_usd,
        "fixed_contracts": fixed_contracts, "lot_multiplier": lot_multiplier,
        "max_contracts": max_contracts, "max_positions": max_positions,
        "autocopy_enable": autocopy_enable, "copy_sl": copy_sl,
        "copy_tp": copy_tp, "inverse_copy": inverse_copy,
        "delay_sec": delay_sec, "magic_number": magic_number,
    }

    def reload_config():
        try:
            db = SessionLocal()
            cfg = db.query(SlaveConfig).filter(SlaveConfig.account_id == account_id).first()
            db.close()
            if cfg:
                _config["risk_mode"] = cfg.risk_mode.value if cfg.risk_mode else "FIXED"
                _config["risk_percent"] = cfg.risk_percent or 0.5
                _config["risk_usd"] = cfg.risk_usd or 50.0
                _config["fixed_contracts"] = cfg.fixed_contracts or 1
                _config["lot_multiplier"] = cfg.lot_multiplier or 1.0
                _config["max_contracts"] = cfg.max_contracts or 100
                _config["max_positions"] = cfg.max_positions or 100
                _config["autocopy_enable"] = cfg.autocopy_enable if cfg.autocopy_enable is not None else True
                _config["copy_sl"] = cfg.copy_sl if cfg.copy_sl is not None else True
                _config["copy_tp"] = cfg.copy_tp if cfg.copy_tp is not None else True
                _config["inverse_copy"] = cfg.inverse_copy or False
                _config["delay_sec"] = cfg.delay_sec or 0.0
                _config["magic_number"] = cfg.magic_number or 0
        except Exception:
            pass

    while not stop_flag.is_set():
        cmd = None
        try:
            cmd = queue.get(timeout=0.5)
        except Exception:
            pass

        if cmd is None:
            continue
        if stop_flag.is_set():
            break

        reload_config()

        if not _config["autocopy_enable"]:
            continue

        action = cmd.get("action")
        payload = cmd.get("payload", {})
        master_account_id = payload.get("master_account_id")

        if master_account_id and not is_slave_linked_to_master(account_id, master_account_id):
            continue

        if action == "OPEN":
            master_ticket = payload["master_ticket"]
            existing = get_slave_ticket(master_ticket, account_id)
            if existing is not None:
                continue

            symbol = payload.get("symbol", "")
            direction = payload.get("direction", "BUY")
            if _config["inverse_copy"]:
                direction = "SELL" if direction.upper() == "BUY" else "BUY"

            reserve_pending(master_ticket, master_account_id, account_id,
                            symbol, payload.get("contracts", 1), payload.get("price", 0), direction)

            if _config["delay_sec"] > 0:
                for _ in range(int(_config["delay_sec"] * 10)):
                    if stop_flag.is_set():
                        break
                    time.sleep(0.1)
                if stop_flag.is_set():
                    break

            sl = payload.get("sl", 0) if _config["copy_sl"] else 0
            tp = payload.get("tp", 0) if _config["copy_tp"] else 0

            if _config["risk_mode"] == "FIXED":
                contracts = calculate_contracts_fixed(_config["fixed_contracts"])
            elif _config["risk_mode"] == "RATIO":
                contracts = calculate_contracts_ratio(payload.get("contracts", 1), _config["lot_multiplier"])
            elif _config["risk_mode"] == "RISK_PERCENT":
                contracts = payload.get("contracts", 1)
            elif _config["risk_mode"] == "RISK_USD":
                contracts = payload.get("contracts", 1)
            elif _config["risk_mode"] == "BALANCE_PROP":
                contracts = payload.get("contracts", 1)
            else:
                contracts = payload.get("contracts", 1)

            if _config["max_contracts"] > 0 and contracts > _config["max_contracts"]:
                contracts = _config["max_contracts"]

            result = conn.open_position(symbol, contracts, direction, sl, tp, _config["magic_number"], account=login)
            if result and result.get("ok"):
                slave_ticket = result.get("position_id", 0)
                confirm_open(master_ticket, account_id, slave_ticket)
                logger.info(f"{display}: OPEN OK {symbol} x{contracts}")
                try:
                    event_queue.put({"type": "copy_ok", "data": {
                        "slave": display, "symbol": symbol, "action": "OPEN",
                        "contracts": contracts, "master_ticket": master_ticket,
                    }})
                except Exception:
                    pass
            else:
                mark_pending_error(master_ticket, account_id)
                logger.error(f"{display}: OPEN FAIL {symbol}")

        elif action == "CLOSE":
            master_ticket = payload["position_ticket"]
            slave_ticket = get_slave_ticket(master_ticket, account_id)
            if not slave_ticket:
                continue

            nt8_pid = payload.get("nt8_position_id", str(slave_ticket))
            result = conn.close_position(str(nt8_pid), account=login)
            if result and result.get("ok"):
                mark_closed(master_ticket, account_id)
                logger.info(f"{display}: CLOSE OK {payload.get('symbol','?')}")

    conn.disconnect()
    logger.info(f"{display}: worker stopped")
