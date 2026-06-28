from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.ticket_map import TicketMap, TicketStatus
from app.engine.orchestrator import get_orchestrator, get_copier_state

router = APIRouter(prefix="/api/copier", tags=["copier"])


@router.get("/status")
def status(db: Session = Depends(get_db)):
    state = get_copier_state()
    orch = get_orchestrator()
    total = db.query(TicketMap).filter(TicketMap.status == TicketStatus.OPEN).count()
    return {
        "running": state["running"] or orch.running,
        "uptime_seconds": state["uptime_seconds"],
        "active_masters": state["active_masters"],
        "active_slaves": state["active_slaves"],
        "total_positions": total,
        "workers": state.get("workers", {}),
    }


@router.post("/start")
def start():
    orch = get_orchestrator()
    return orch.start()


@router.post("/stop")
def stop():
    orch = get_orchestrator()
    if not orch.running:
        return {"ok": False, "message": "Not running"}
    orch.stop()
    return {"ok": True, "message": "Copier stopped"}


@router.post("/emergency-close/{slave_id}")
def emergency_close(slave_id: str, db: Session = Depends(get_db)):
    from app.models.account import Account
    from app.engine.nt8_connector import NT8Connector

    slave = db.query(Account).filter(Account.id == slave_id, Account.role == "SLAVE").first()
    if not slave:
        return {"ok": False, "error": "Slave no encontrado"}

    conn = NT8Connector(slave.bridge_host, slave.bridge_port)
    if not conn.connect():
        return {"ok": False, "error": "No se pudo conectar al bridge NT8"}

    positions = conn.get_positions()
    closed = 0
    errors = 0

    for p in positions:
        pid = p.get("id", "")
        if pid:
            result = conn.close_position(str(pid))
            if result and result.get("ok"):
                closed += 1
                db.query(TicketMap).filter(
                    TicketMap.slave_account_id == slave_id,
                    TicketMap.status == TicketStatus.OPEN,
                ).update({TicketMap.status: TicketStatus.CLOSED})
            else:
                errors += 1

    db.commit()
    conn.disconnect()
    return {"ok": True, "closed": closed, "errors": errors, "total": len(positions)}


@router.post("/sync")
def sync_positions():
    from app.engine.ticket_mapper import reconcile_stale_positions
    fixed = reconcile_stale_positions()
    return {"ok": True, "fixed": fixed}


@router.get("/dashboard")
def dashboard_stats():
    from app.models.account import Account
    from app.engine.nt8_connector import NT8Connector
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        accounts = db.query(Account).filter(Account.active == True).all()
        result = {}
        for acc in accounts:
            try:
                conn = NT8Connector(acc.bridge_host, acc.bridge_port)
                info = conn.get_account(acc.login)
                if info and info.get("ok"):
                    result[acc.id] = {
                        "unrealized": info.get("unrealized", 0),
                        "positions": info.get("positions", 0),
                    }
                else:
                    result[acc.id] = {"unrealized": 0, "positions": 0}
                conn.disconnect()
            except Exception:
                result[acc.id] = {"unrealized": 0, "positions": 0}
        return {"ok": True, "data": result}
    finally:
        db.close()
