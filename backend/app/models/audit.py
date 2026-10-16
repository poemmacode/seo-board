import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, JSON, Text
from app.core.database import Base


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    url = Column(String(2048), nullable=False, index=True)
    domain = Column(String(255), nullable=False, index=True)
    
    # Rendimiento y Red
    status_code = Column(Integer, nullable=False)
    response_time_ms = Column(Float, nullable=False)
    canonical_url = Column(String(2048), nullable=True)
    is_redirect = Column(Boolean, default=False)
    redirect_url = Column(String(2048), nullable=True)

    # Metadatos On-Page
    title = Column(String(512), nullable=True)
    title_length = Column(Integer, default=0)
    description = Column(Text, nullable=True)
    description_length = Column(Integer, default=0)
    robots_meta = Column(String(255), nullable=True)
    viewport_meta = Column(String(255), nullable=True)
    open_graph = Column(JSON, default=dict)

    # Estructura del DOM
    headings = Column(JSON, default=list)            # Lista ordenada de [{level: 'H1', text: '...'}]
    headings_summary = Column(JSON, default=dict)    # {h1_count, h2_count, h3_count, missing_h1, multiple_h1}
    images_summary = Column(JSON, default=dict)      # {total, missing_alt_count, missing_alt_samples}
    links_summary = Column(JSON, default=dict)       # {internal_count, external_count, sample_internal, sample_external}
    structured_data = Column(JSON, default=dict)     # {raw_schemas: [...], detected_types: [...]}
    content_stats = Column(JSON, default=dict)       # {word_count, reading_time_min, text_snippet}

    # Diagnósticos calculados (OK, WARNING, CRITICAL)
    issues = Column(JSON, default=list)

    # Análisis de Inteligencia Artificial
    ai_analysis = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
