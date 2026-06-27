from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.account import SlaveTemplate
from app.schemas.account import (
    SlaveTemplateCreate, SlaveTemplateUpdate, SlaveTemplateResponse,
)

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=list[SlaveTemplateResponse])
def list_templates(db: Session = Depends(get_db)):
    return db.query(SlaveTemplate).order_by(SlaveTemplate.name).all()


@router.post("", response_model=SlaveTemplateResponse, status_code=201)
def create_template(data: SlaveTemplateCreate, db: Session = Depends(get_db)):
    t = SlaveTemplate(**data.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.put("/{template_id}", response_model=SlaveTemplateResponse)
def update_template(template_id: str, data: SlaveTemplateUpdate, db: Session = Depends(get_db)):
    t = db.query(SlaveTemplate).filter(SlaveTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(t, key, value)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    t = db.query(SlaveTemplate).filter(SlaveTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    db.delete(t)
    db.commit()
