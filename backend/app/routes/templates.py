from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import TaskTemplate
from app.schemas.template import TemplateOut, TemplateCreate, TemplateUpdate
from app.services.templates import get_default_templates

router = APIRouter()


def _seed_templates(db: Session) -> None:
    count = db.execute(select(func.count()).select_from(TaskTemplate)).scalar()
    if count and int(count) > 0:
        return
    defaults = get_default_templates()
    for item in defaults:
        tpl = TaskTemplate(
            name=item["name"],
            industry=item["industry"],
            strength=item["strength"],
            rules=item["rules"],
        )
        db.add(tpl)
    db.commit()


@router.get("/templates/tasks")

def list_task_templates(db: Session = Depends(get_db)):
    _seed_templates(db)
    rows = db.execute(select(TaskTemplate).order_by(TaskTemplate.id.asc())).scalars().all()
    items = [TemplateOut.model_validate(r) for r in rows]
    return {"items": items}


@router.post("/templates/tasks", response_model=TemplateOut)

def create_task_template(payload: TemplateCreate, db: Session = Depends(get_db)):
    tpl = TaskTemplate(
        name=payload.name,
        industry=payload.industry,
        strength=payload.strength,
        rules=payload.rules,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return TemplateOut.model_validate(tpl)


@router.put("/templates/tasks/{template_id}", response_model=TemplateOut)

def update_task_template(template_id: int, payload: TemplateUpdate, db: Session = Depends(get_db)):
    tpl = db.get(TaskTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(tpl, key, value)
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return TemplateOut.model_validate(tpl)


@router.delete("/templates/tasks/{template_id}")

def delete_task_template(template_id: int, db: Session = Depends(get_db)):
    tpl = db.get(TaskTemplate, template_id)
    if not tpl:
        return {"ok": False}
    db.delete(tpl)
    db.commit()
    return {"ok": True}
