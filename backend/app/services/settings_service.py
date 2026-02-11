from sqlalchemy.orm import Session

from app.models import SystemSetting


def get_or_create_settings(db: Session) -> SystemSetting:
    setting = db.get(SystemSetting, 1)
    if not setting:
        setting = SystemSetting(id=1)
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting
