from fastapi import APIRouter

from app.api.routes import projects, conflicts, risk, coordinate, simulate, workplans, impact

api_router = APIRouter()

api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(conflicts.router, prefix="/conflicts", tags=["conflicts"])
api_router.include_router(risk.router, prefix="/risk", tags=["risk"])
api_router.include_router(coordinate.router, prefix="/coordinate", tags=["coordinate"])
api_router.include_router(simulate.router, prefix="/simulate", tags=["simulate"])
api_router.include_router(workplans.router, prefix="/workplans", tags=["workplans"])
api_router.include_router(impact.router, prefix="/impact", tags=["impact"])
