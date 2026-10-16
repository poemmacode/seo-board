from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.api.v1.router import api_router
from app.models.audit import AuditRecord  # noqa: F401 — registra el modelo para create_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="SEOBoard — Suite SEO Interna",
    description="Auditoría técnica On-Page con IA. Módulos futuros: keywords, SERP tracking, competidores.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "env": settings.ENVIRONMENT, "ai_provider": settings.AI_PROVIDER}
