from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.account import (
    AccountCreate, AccountUpdate, AccountResponse, SlaveConfigUpdate,
    SlaveConfigResponse, SlaveMasterLinkRequest, AccountTestResult,
)
from app.services.account_service import (
    get_accounts, get_account, create_account, update_account, delete_account,
    get_slave_config, update_slave_config, get_slave_masters, update_slave_masters,
    get_master_slaves,
)

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountResponse])
def list_accounts(role: str | None = None, db: Session = Depends(get_db)):
    return get_accounts(db, role=role)


@router.post("", response_model=AccountResponse, status_code=201)
def create(account: AccountCreate, db: Session = Depends(get_db)):
    return create_account(db, account)


@router.get("/{account_id}", response_model=AccountResponse)
def get_one(account_id: str, db: Session = Depends(get_db)):
    acc = get_account(db, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@router.put("/{account_id}", response_model=AccountResponse)
def update(account_id: str, account: AccountUpdate, db: Session = Depends(get_db)):
    acc = update_account(db, account_id, account)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    return acc


@router.delete("/{account_id}", status_code=204)
def delete(account_id: str, db: Session = Depends(get_db)):
    if not delete_account(db, account_id):
        raise HTTPException(status_code=404, detail="Account not found")


@router.post("/{account_id}/test", response_model=AccountTestResult)
def test_account(account_id: str, db: Session = Depends(get_db)):
    acc = get_account(db, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    try:
        import socket, json
        s = socket.socket()
        s.settimeout(3)
        s.connect((acc.bridge_host, acc.bridge_port))
        s.sendall(json.dumps({"action": "ACCOUNT", "account": acc.name}).encode() + b"\n")
        resp = b""
        while b"\n" not in resp:
            chunk = s.recv(4096)
            if not chunk: break
            resp += chunk
        s.close()
        text = resp.decode("utf-8-sig").strip()
        data = json.loads(text)
        if data.get("ok"):
            msg = f"{data.get('name', acc.name)} - Balance: {data.get('balance', '?')} | {data.get('positions', 0)} posiciones"
            return {"success": True, "message": msg, "balance": data.get("balance"), "server": f"{acc.bridge_host}:{acc.bridge_port}"}
        return {"success": False, "message": data.get("error", "Respuesta inesperada")}
    except Exception as e:
        return {"success": False, "message": f"No se pudo conectar al bridge: {e}"}


@router.get("/slaves/{account_id}/config", response_model=SlaveConfigResponse)
def get_config(account_id: str, db: Session = Depends(get_db)):
    config = get_slave_config(db, account_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return config


@router.put("/slaves/{account_id}/config", response_model=SlaveConfigResponse)
def update_config(account_id: str, config: SlaveConfigUpdate, db: Session = Depends(get_db)):
    return update_slave_config(db, account_id, config)


@router.get("/slaves/{slave_id}/masters", response_model=list[dict])
def list_slave_masters(slave_id: str, db: Session = Depends(get_db)):
    masters = get_slave_masters(db, slave_id)
    return [{"slave_id": slave_id, "master_id": m.id, "active": True} for m in masters]


@router.put("/slaves/{slave_id}/masters")
def set_slave_masters(slave_id: str, data: SlaveMasterLinkRequest, db: Session = Depends(get_db)):
    update_slave_masters(db, slave_id, data)
    return {"slave_id": slave_id, "master_ids": data.master_ids}


@router.get("/masters/{master_id}/slaves", response_model=list[AccountResponse])
def list_master_slaves(master_id: str, db: Session = Depends(get_db)):
    return get_master_slaves(db, master_id)
