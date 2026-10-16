from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.audit import AuditRecord
from app.models.schemas import (
    AuditRequest,
    AuditResponse,
    AuditSummary,
    AIAnalysisResult,
)
from app.services.crawler import crawler_service, CrawlerException
from app.services.ai_analyzer import ai_analyzer_service

router = APIRouter()


def _record_to_response(record: AuditRecord) -> AuditResponse:
    return AuditResponse(
        id=record.id,
        url=record.url,
        domain=record.domain,
        status_code=record.status_code,
        response_time_ms=record.response_time_ms,
        canonical_url=record.canonical_url,
        is_redirect=bool(record.is_redirect),
        redirect_url=record.redirect_url,
        title=record.title,
        title_length=record.title_length or 0,
        description=record.description,
        description_length=record.description_length or 0,
        robots_meta=record.robots_meta,
        viewport_meta=record.viewport_meta,
        open_graph=record.open_graph or {},
        headings=record.headings or [],
        headings_summary=record.headings_summary,
        images_summary=record.images_summary,
        links_summary=record.links_summary,
        structured_data=record.structured_data,
        content_stats=record.content_stats,
        issues=record.issues or [],
        ai_analysis=AIAnalysisResult(**record.ai_analysis) if record.ai_analysis else None,
        created_at=record.created_at,
    )


def _record_to_summary(record: AuditRecord) -> AuditSummary:
    issues = record.issues or []
    critical = sum(1 for i in issues if isinstance(i, dict) and i.get("severity") == "critical")
    warning = sum(1 for i in issues if isinstance(i, dict) and i.get("severity") == "warning")
    content_stats = record.content_stats or {}
    return AuditSummary(
        id=record.id,
        url=record.url,
        domain=record.domain,
        status_code=record.status_code,
        response_time_ms=record.response_time_ms,
        title=record.title,
        word_count=content_stats.get("word_count", 0) if isinstance(content_stats, dict) else 0,
        issues_critical_count=critical,
        issues_warning_count=warning,
        has_ai_analysis=bool(record.ai_analysis),
        created_at=record.created_at,
    )


@router.post("/audit/url", response_model=AuditResponse, summary="Auditar una URL on-demand")
async def audit_url(payload: AuditRequest, db: AsyncSession = Depends(get_db)):
    raw_url = (payload.url or "").strip()
    if not raw_url:
        raise HTTPException(status_code=422, detail="La URL es obligatoria.")

    # 1. Crawling on-demand
    try:
        data = await crawler_service.fetch_and_extract(raw_url)
    except CrawlerException as e:
        raise HTTPException(status_code=502, detail=e.message)

    # 2. Capa IA opcional
    ai_result: AIAnalysisResult | None = None
    if payload.include_ai:
        try:
            ai_result = await ai_analyzer_service.analyze(
                url=data["url"],
                title=data.get("title"),
                description=data.get("description"),
                headings_tree=data.get("headings", []),
                content_snippet=(data.get("content_stats") or {}).get("text_snippet", ""),
                word_count=(data.get("content_stats") or {}).get("word_count", 0),
            )
        except Exception:
            ai_result = None

    # 3. Persistencia
    record = AuditRecord(
        url=data["url"],
        domain=data["domain"],
        status_code=data["status_code"],
        response_time_ms=data["response_time_ms"],
        canonical_url=data.get("canonical_url"),
        is_redirect=data.get("is_redirect", False),
        redirect_url=data.get("redirect_url"),
        title=data.get("title"),
        title_length=data.get("title_length", 0),
        description=data.get("description"),
        description_length=data.get("description_length", 0),
        robots_meta=data.get("robots_meta"),
        viewport_meta=data.get("viewport_meta"),
        open_graph=data.get("open_graph", {}),
        headings=data.get("headings", []),
        headings_summary=data.get("headings_summary", {}),
        images_summary=data.get("images_summary", {}),
        links_summary=data.get("links_summary", {}),
        structured_data=data.get("structured_data", {}),
        content_stats=data.get("content_stats", {}),
        issues=data.get("issues", []),
        ai_analysis=ai_result.model_dump() if ai_result else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    return _record_to_response(record)


@router.get("/audit/history", response_model=List[AuditSummary], summary="Últimas auditorías")
async def audit_history(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditRecord).order_by(desc(AuditRecord.created_at)).limit(limit)
    )
    records = result.scalars().all()
    return [_record_to_summary(r) for r in records]


@router.get("/audit/{audit_id}", response_model=AuditResponse, summary="Obtener auditoría por ID")
async def get_audit(audit_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditRecord).where(AuditRecord.id == audit_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
    return _record_to_response(record)


@router.post(
    "/audit/{audit_id}/ai-rerun",
    response_model=AuditResponse,
    summary="Regenerar análisis IA de una auditoría existente",
)
async def rerun_ai(audit_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditRecord).where(AuditRecord.id == audit_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada.")

    ai_result = await ai_analyzer_service.analyze(
        url=record.url,
        title=record.title,
        description=record.description,
        headings_tree=record.headings or [],
        content_snippet=(record.content_stats or {}).get("text_snippet", ""),
        word_count=(record.content_stats or {}).get("word_count", 0),
    )
    record.ai_analysis = ai_result.model_dump()
    await db.commit()
    await db.refresh(record)
    return _record_to_response(record)


@router.delete("/audit/{audit_id}", summary="Eliminar auditoría")
async def delete_audit(audit_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AuditRecord).where(AuditRecord.id == audit_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
    await db.delete(record)
    await db.commit()
    return {"deleted": True, "id": audit_id}
