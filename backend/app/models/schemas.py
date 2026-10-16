from datetime import datetime
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, HttpUrl, Field


class AuditRequest(BaseModel):
    url: str = Field(..., description="URL absoluta a auditar (ej. https://ejemplo.com)")
    include_ai: bool = Field(default=True, description="Si se debe ejecutar el análisis con LLM")


class HeadingItem(BaseModel):
    level: str  # H1, H2, H3, H4, H5, H6
    text: str


class HeadingsSummary(BaseModel):
    h1_count: int
    h2_count: int
    h3_count: int
    missing_h1: bool
    multiple_h1: bool
    h1_items: List[str] = []


class ImageIssueItem(BaseModel):
    src: str
    alt: Optional[str] = None


class ImagesSummary(BaseModel):
    total: int
    missing_alt_count: int
    missing_alt_samples: List[ImageIssueItem] = []


class LinksSummary(BaseModel):
    internal_count: int
    external_count: int
    sample_internal: List[str] = []
    sample_external: List[str] = []


class StructuredDataSummary(BaseModel):
    schemas_count: int
    detected_types: List[str] = []
    items: List[Dict[str, Any]] = []


class ContentStats(BaseModel):
    word_count: int
    reading_time_min: float
    text_snippet: str = ""


class AuditIssue(BaseModel):
    category: str  # Meta, Headers, Images, Links, Indexing, Performance
    severity: str  # ok, warning, critical
    title: str
    message: str


class AIAnalysisResult(BaseModel):
    search_intent: str = Field(..., description="Informacional, Comercial, Transaccional o Navegacional")
    intent_explanation: str = Field(..., description="Justificación breve de la intención detectada")
    title_suggestions: List[str] = Field(..., description="2-3 sugerencias de títulos optimizados para CTR y SEO")
    description_suggestions: List[str] = Field(..., description="2-3 sugerencias de meta descripciones persuasivas")
    content_evaluation: Dict[str, Any] = Field(
        default_factory=dict,
        description="Diagnóstico de thin content, riesgos de canibalización y valor semántico"
    )
    geo_aeo_recommendations: List[str] = Field(
        ...,
        description="Exactamente 3 recomendaciones prácticas para Answer Engine Optimization y Search Generative Experience"
    )


class AuditResponse(BaseModel):
    id: str
    url: str
    domain: str
    status_code: int
    response_time_ms: float
    canonical_url: Optional[str] = None
    is_redirect: bool = False
    redirect_url: Optional[str] = None

    # Meta
    title: Optional[str] = None
    title_length: int = 0
    description: Optional[str] = None
    description_length: int = 0
    robots_meta: Optional[str] = None
    viewport_meta: Optional[str] = None
    open_graph: Dict[str, Any] = {}

    # Estructura
    headings: List[HeadingItem] = []
    headings_summary: HeadingsSummary
    images_summary: ImagesSummary
    links_summary: LinksSummary
    structured_data: StructuredDataSummary
    content_stats: ContentStats

    # Diagnósticos y Recomendaciones
    issues: List[AuditIssue] = []
    ai_analysis: Optional[AIAnalysisResult] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditSummary(BaseModel):
    id: str
    url: str
    domain: str
    status_code: int
    response_time_ms: float
    title: Optional[str] = None
    word_count: int = 0
    issues_critical_count: int = 0
    issues_warning_count: int = 0
    has_ai_analysis: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class RerunAIRequest(BaseModel):
    pass
