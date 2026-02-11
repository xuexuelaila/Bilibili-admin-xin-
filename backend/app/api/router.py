from fastapi import APIRouter

from app.routes.tasks import router as tasks_router
from app.routes.runs import router as runs_router
from app.routes.videos import router as videos_router
from app.routes.metrics import router as metrics_router
from app.routes.health import router as health_router
from app.routes.settings import router as settings_router
from app.routes.alerts import router as alerts_router
from app.routes.templates import router as templates_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(metrics_router, prefix="/metrics", tags=["metrics"])
api_router.include_router(settings_router, tags=["settings"])
api_router.include_router(alerts_router, tags=["alerts"])
api_router.include_router(templates_router, tags=["templates"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(runs_router, tags=["runs"])
api_router.include_router(videos_router, prefix="/videos", tags=["videos"])
