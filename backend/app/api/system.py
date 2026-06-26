from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings, get_version
from app.schemas.copier import HealthResponse

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)):
    try:
        db.connection()
        db_ok = True
    except Exception:
        db_ok = False
    return HealthResponse(status="ok", version=get_version(), db_connected=db_ok)
