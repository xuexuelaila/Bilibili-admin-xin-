from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Run
from app.schemas.run import RunOut

router = APIRouter()


@router.get("/runs/{run_id}", response_model=RunOut)

def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return RunOut.model_validate(run)
