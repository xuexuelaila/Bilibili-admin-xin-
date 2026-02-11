from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services.settings_service import get_or_create_settings

router = APIRouter()


@router.get("/settings", response_model=SettingsOut)

def get_settings(db: Session = Depends(get_db)):
    setting = get_or_create_settings(db)
    return SettingsOut.model_validate(setting)


@router.put("/settings", response_model=SettingsOut)

def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    setting = get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(setting, key, value)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return SettingsOut.model_validate(setting)
