from fastapi import APIRouter
from app.api.v1.audit import router as audit_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(audit_router, tags=["Audit On-Page"])


# ---------------------------------------------------------------------------
# Módulos futuros (desacoplados, listos para implementar feature por feature)
# ---------------------------------------------------------------------------

keywords_router = APIRouter(prefix="/keywords", tags=["Keyword Research"])
serp_router = APIRouter(prefix="/serp", tags=["SERP Rank Tracking"])
competitors_router = APIRouter(prefix="/competitors", tags=["Competidores"])


@keywords_router.get("/status")
async def keywords_status():
    return {"module": "keyword-research", "status": "roadmap", "message": "Módulo desacoplado, pendiente de implementación."}


@serp_router.get("/status")
async def serp_status():
    return {"module": "serp-tracking", "status": "roadmap", "message": "Módulo desacoplado, pendiente de implementación."}


@competitors_router.get("/status")
async def competitors_status():
    return {"module": "competitors", "status": "roadmap", "message": "Módulo desacoplado, pendiente de implementación."}


api_router.include_router(keywords_router)
api_router.include_router(serp_router)
api_router.include_router(competitors_router)
