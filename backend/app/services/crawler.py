import re
import time
import json
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urlparse, urljoin
import httpx
from bs4 import BeautifulSoup

from app.core.config import settings
from app.models.schemas import (
    HeadingItem,
    HeadingsSummary,
    ImageIssueItem,
    ImagesSummary,
    LinksSummary,
    StructuredDataSummary,
    ContentStats,
    AuditIssue
)


class CrawlerException(Exception):
    """Excepción base para fallos del crawler"""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class BaseExtractor(ABC):
    """
    Interfaz desacoplada para extracción de páginas.
    Permite alternar entre HTTP estático (httpx + bs4) y navegadores headless (Playwright).
    """
    @abstractmethod
    async def fetch_and_extract(self, url: str) -> Dict[str, Any]:
        pass


class HttpCrawler(BaseExtractor):
    """
    Crawler asíncrono de alto rendimiento usando httpx y BeautifulSoup4 (lxml).
    Incluye User-Agent spoofing, seguimiento de redirecciones y control de excepciones.
    """

    def __init__(self):
        self.headers = {
            "User-Agent": settings.CRAWLER_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }

    async def fetch_and_extract(self, raw_url: str) -> Dict[str, Any]:
        normalized_url = self._normalize_url(raw_url)
        parsed_target = urlparse(normalized_url)

        transport = httpx.AsyncHTTPTransport(retries=1, verify=False)
        client_limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)

        start_time = time.perf_counter()

        try:
            async with httpx.AsyncClient(
                transport=transport,
                limits=client_limits,
                headers=self.headers,
                timeout=httpx.Timeout(settings.CRAWLER_TIMEOUT_SECONDS, connect=8.0),
                follow_redirects=True,
                max_redirects=settings.CRAWLER_MAX_REDIRECTS,
            ) as client:
                response = await client.get(normalized_url)
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)

                final_url = str(response.url)
                is_redirect = len(response.history) > 0
                redirect_url = final_url if is_redirect else None

                # Verificamos tipo de contenido
                content_type = response.headers.get("content-type", "").lower()
                if "text/html" not in content_type and "application/xhtml+xml" not in content_type:
                    raise CrawlerException(
                        f"El recurso no es un documento HTML (Content-Type recibido: '{content_type}')",
                        status_code=response.status_code
                    )

                html_text = response.text

        except httpx.TooManyRedirects:
            raise CrawlerException("Demasiadas redirecciones (bucle infinito detectado)", status_code=310)
        except httpx.ConnectTimeout:
            raise CrawlerException(f"Tiempo de espera agotado al conectar con {normalized_url}", status_code=504)
        except httpx.ReadTimeout:
            raise CrawlerException(f"Tiempo de lectura agotado al descargar la página de {normalized_url}", status_code=504)
        except httpx.ConnectError as e:
            raise CrawlerException(f"Error al conectar con el servidor (DNS o caída de host): {str(e)}", status_code=502)
        except httpx.RequestError as e:
            raise CrawlerException(f"Error de red durante la petición: {str(e)}", status_code=500)
        except CrawlerException:
            raise
        except Exception as e:
            raise CrawlerException(f"Fallo inesperado al rastrear la URL: {str(e)}", status_code=500)

        # Parsear HTML con BeautifulSoup + lxml
        try:
            soup = BeautifulSoup(html_text, "lxml")
        except Exception:
            soup = BeautifulSoup(html_text, "html.parser")

        extracted_data = self._parse_html(
            soup=soup,
            base_url=final_url,
            original_url=normalized_url,
            status_code=response.status_code,
            latency_ms=latency_ms,
            is_redirect=is_redirect,
            redirect_url=redirect_url
        )

        return extracted_data

    def _normalize_url(self, url: str) -> str:
        url = url.strip()
        if not re.match(r"^https?://", url, re.IGNORECASE):
            url = f"https://{url}"
        return url

    def _parse_html(
        self,
        soup: BeautifulSoup,
        base_url: str,
        original_url: str,
        status_code: int,
        latency_ms: float,
        is_redirect: bool,
        redirect_url: Optional[str]
    ) -> Dict[str, Any]:
        parsed_base = urlparse(base_url)
        domain = parsed_base.netloc

        # 1. Metadatos
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None
        title_length = len(title) if title else 0

        desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
        description = desc_tag.get("content", "").strip() if desc_tag and desc_tag.get("content") else None
        description_length = len(description) if description else 0

        robots_tag = soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
        robots_meta = robots_tag.get("content", "").strip() if robots_tag and robots_tag.get("content") else None

        viewport_tag = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
        viewport_meta = viewport_tag.get("content", "").strip() if viewport_tag and viewport_tag.get("content") else None

        canonical_tag = soup.find("link", attrs={"rel": re.compile(r"^canonical$", re.I)})
        canonical_url = canonical_tag.get("href", "").strip() if canonical_tag and canonical_tag.get("href") else None
        if canonical_url:
            canonical_url = urljoin(base_url, canonical_url)

        # OpenGraph
        og_data: Dict[str, str] = {}
        for og_meta in soup.find_all("meta", property=re.compile(r"^og:", re.I)):
            prop = og_meta.get("property", "").lower()
            val = og_meta.get("content", "")
            if prop and val:
                og_data[prop] = val

        # 2. Encabezados (H1 - H6 en orden de aparición en el DOM)
        headings: List[HeadingItem] = []
        h1_items: List[str] = []
        h1_count = 0
        h2_count = 0
        h3_count = 0

        for h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
            tag_name = h.name.upper()
            text = h.get_text(" ", strip=True)
            if not text:
                continue
            headings.append(HeadingItem(level=tag_name, text=text))
            if tag_name == "H1":
                h1_count += 1
                h1_items.append(text)
            elif tag_name == "H2":
                h2_count += 1
            elif tag_name == "H3":
                h3_count += 1

        headings_summary = HeadingsSummary(
            h1_count=h1_count,
            h2_count=h2_count,
            h3_count=h3_count,
            missing_h1=(h1_count == 0),
            multiple_h1=(h1_count > 1),
            h1_items=h1_items
        )

        # 3. Imágenes
        img_tags = soup.find_all("img")
        total_images = len(img_tags)
        missing_alt_samples: List[ImageIssueItem] = []
        missing_alt_count = 0

        for img in img_tags:
            src = img.get("src") or img.get("data-src") or ""
            alt = img.get("alt")
            # Si no tiene atributo alt o este es solo espacios en blanco
            if alt is None or alt.strip() == "":
                missing_alt_count += 1
                if len(missing_alt_samples) < 15 and src:
                    resolved_src = urljoin(base_url, src)
                    missing_alt_samples.append(ImageIssueItem(src=resolved_src, alt=alt))

        images_summary = ImagesSummary(
            total=total_images,
            missing_alt_count=missing_alt_count,
            missing_alt_samples=missing_alt_samples
        )

        # 4. Enlaces (Internos vs Externos)
        internal_links = set()
        external_links = set()

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue
            resolved_link = urljoin(base_url, href)
            link_parsed = urlparse(resolved_link)
            if link_parsed.scheme in ("http", "https"):
                if link_parsed.netloc == domain or link_parsed.netloc.endswith(f".{domain}"):
                    internal_links.add(resolved_link)
                else:
                    external_links.add(resolved_link)

        links_summary = LinksSummary(
            internal_count=len(internal_links),
            external_count=len(external_links),
            sample_internal=list(internal_links)[:10],
            sample_external=list(external_links)[:10]
        )

        # 5. Datos estructurados JSON-LD
        detected_types: List[str] = []
        parsed_schemas: List[Dict[str, Any]] = []
        ld_scripts = soup.find_all("script", attrs={"type": "application/ld+json"})

        for s in ld_scripts:
            try:
                raw_json = s.string or s.get_text()
                if raw_json and raw_json.strip():
                    data = json.loads(raw_json)
                    if isinstance(data, dict):
                        parsed_schemas.append(data)
                        self._extract_types(data, detected_types)
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict):
                                parsed_schemas.append(item)
                                self._extract_types(item, detected_types)
            except Exception:
                # Si algún JSON-LD tiene errores sintácticos, ignoramos de forma segura
                pass

        structured_data = StructuredDataSummary(
            schemas_count=len(parsed_schemas),
            detected_types=list(dict.fromkeys(detected_types)),
            items=parsed_schemas[:5]  # Primeros 5 esquemas para no saturar memoria
        )

        # 6. Conteo de palabras y texto limpio del cuerpo principal
        content_stats = self._extract_content_stats(soup)

        # 7. Diagnósticos automáticos (Issues)
        issues = self._calculate_issues(
            status_code=status_code,
            latency_ms=latency_ms,
            title=title,
            title_length=title_length,
            description=description,
            description_length=description_length,
            canonical_url=canonical_url,
            base_url=base_url,
            viewport_meta=viewport_meta,
            robots_meta=robots_meta,
            headings_summary=headings_summary,
            images_summary=images_summary,
            content_stats=content_stats
        )

        return {
            "url": base_url,
            "domain": domain,
            "status_code": status_code,
            "response_time_ms": latency_ms,
            "canonical_url": canonical_url,
            "is_redirect": is_redirect,
            "redirect_url": redirect_url,
            "title": title,
            "title_length": title_length,
            "description": description,
            "description_length": description_length,
            "robots_meta": robots_meta,
            "viewport_meta": viewport_meta,
            "open_graph": og_data,
            "headings": [h.model_dump() for h in headings],
            "headings_summary": headings_summary.model_dump(),
            "images_summary": images_summary.model_dump(),
            "links_summary": links_summary.model_dump(),
            "structured_data": structured_data.model_dump(),
            "content_stats": content_stats.model_dump(),
            "issues": [i.model_dump() for i in issues]
        }

    def _extract_types(self, item: Dict[str, Any], acc: List[str]) -> None:
        if "@type" in item:
            val = item["@type"]
            if isinstance(val, str):
                acc.append(val)
            elif isinstance(val, list):
                acc.extend([str(v) for v in val])
        if "@graph" in item and isinstance(item["@graph"], list):
            for sub in item["@graph"]:
                if isinstance(sub, dict):
                    self._extract_types(sub, acc)

    def _extract_content_stats(self, soup: BeautifulSoup) -> ContentStats:
        # Clonamos el soup para no alterar la búsqueda original
        soup_copy = BeautifulSoup(str(soup), "html.parser")
        for tag in soup_copy(["script", "style", "nav", "noscript", "svg", "header", "footer"]):
            tag.decompose()

        main_element = soup_copy.find("main") or soup_copy.find("article") or soup_copy.find("body")
        raw_text = main_element.get_text(" ", strip=True) if main_element else ""

        words = re.findall(r"\b\w+\b", raw_text)
        word_count = len(words)
        # Velocidad de lectura media en español: ~200 palabras por minuto
        reading_time = round(word_count / 200, 1)

        snippet = " ".join(words[:250]) if words else ""

        return ContentStats(
            word_count=word_count,
            reading_time_min=reading_time,
            text_snippet=snippet
        )

    def _calculate_issues(
        self,
        status_code: int,
        latency_ms: float,
        title: Optional[str],
        title_length: int,
        description: Optional[str],
        description_length: int,
        canonical_url: Optional[str],
        base_url: str,
        viewport_meta: Optional[str],
        robots_meta: Optional[str],
        headings_summary: HeadingsSummary,
        images_summary: ImagesSummary,
        content_stats: ContentStats
    ) -> List[AuditIssue]:
        issues: List[AuditIssue] = []

        # Estado HTTP
        if status_code != 200:
            issues.append(AuditIssue(
                category="Indexing",
                severity="critical" if status_code >= 400 else "warning",
                title=f"Código de respuesta HTTP {status_code}",
                message=f"La URL respondió con código {status_code}. Se esperaba 200 OK para indexación óptima."
            ))
        else:
            issues.append(AuditIssue(
                category="Indexing",
                severity="ok",
                title="Estado HTTP 200 OK",
                message="La página responde correctamente con código 200."
            ))

        # Latencia / Velocidad
        if latency_ms > 2000:
            issues.append(AuditIssue(
                category="Performance",
                severity="critical",
                title="Tiempo de respuesta muy lento",
                message=f"La página tardó {latency_ms} ms en responder (> 2.0s). Podría afectar el rastreo y Core Web Vitals."
            ))
        elif latency_ms > 800:
            issues.append(AuditIssue(
                category="Performance",
                severity="warning",
                title="Tiempo de respuesta moderado",
                message=f"La página tardó {latency_ms} ms. Se recomienda reducir el TTFB por debajo de 800 ms."
            ))
        else:
            issues.append(AuditIssue(
                category="Performance",
                severity="ok",
                title="Tiempo de respuesta rápido",
                message=f"Excelente latencia de servidor ({latency_ms} ms)."
            ))

        # Title
        if not title:
            issues.append(AuditIssue(
                category="Meta",
                severity="critical",
                title="Falta la etiqueta <title>",
                message="La página no tiene título definido, elemento vital para el ranking y CTR en Google."
            ))
        elif title_length < 30:
            issues.append(AuditIssue(
                category="Meta",
                severity="warning",
                title="Título demasiado corto",
                message=f"El título tiene solo {title_length} caracteres. La longitud recomendada es entre 45 y 65 caracteres."
            ))
        elif title_length > 65:
            issues.append(AuditIssue(
                category="Meta",
                severity="warning",
                title="Título demasiado largo",
                message=f"El título tiene {title_length} caracteres y probablemente sea recortado en las SERPs (máx recomendado ~60-65)."
            ))
        else:
            issues.append(AuditIssue(
                category="Meta",
                severity="ok",
                title="Longitud de título óptima",
                message=f"El título tiene una longitud ideal ({title_length} caracteres)."
            ))

        # Description
        if not description:
            issues.append(AuditIssue(
                category="Meta",
                severity="warning",
                title="Falta la meta descripción",
                message="No se encontró etiqueta meta description. Aunque no es factor de ranking directo, define el snippet en las SERPs."
            ))
        elif description_length < 70:
            issues.append(AuditIssue(
                category="Meta",
                severity="warning",
                title="Meta descripción corta",
                message=f"La descripción tiene {description_length} caracteres. Se recomienda entre 120 y 160 caracteres."
            ))
        elif description_length > 165:
            issues.append(AuditIssue(
                category="Meta",
                severity="warning",
                title="Meta descripción demasiado larga",
                message=f"La descripción tiene {description_length} caracteres y podría ser truncada en resultados de búsqueda."
            ))
        else:
            issues.append(AuditIssue(
                category="Meta",
                severity="ok",
                title="Meta descripción óptima",
                message=f"Longitud balanceada para snippets de búsqueda ({description_length} caracteres)."
            ))

        # Headings H1
        if headings_summary.missing_h1:
            issues.append(AuditIssue(
                category="Headers",
                severity="critical",
                title="Falta encabezado H1",
                message="La página carece de un encabezado principal <h1> para definir el tema del contenido."
            ))
        elif headings_summary.multiple_h1:
            issues.append(AuditIssue(
                category="Headers",
                severity="warning",
                title="Múltiples encabezados H1 detectados",
                message=f"Se encontraron {headings_summary.h1_count} etiquetas H1. Aunque HTML5 lo permite, se recomienda un único H1 temático claro."
            ))
        else:
            issues.append(AuditIssue(
                category="Headers",
                severity="ok",
                title="Estructura H1 correcta",
                message="Se detectó un único encabezado H1 principal."
            ))

        # Imágenes ALT
        if images_summary.missing_alt_count > 0:
            severity = "critical" if images_summary.missing_alt_count > 5 else "warning"
            issues.append(AuditIssue(
                category="Images",
                severity=severity,
                title=f"{images_summary.missing_alt_count} imágenes sin atributo ALT",
                message="Las imágenes sin texto alternativo perjudican la accesibilidad web y el SEO de Google Imágenes."
            ))
        elif images_summary.total > 0:
            issues.append(AuditIssue(
                category="Images",
                severity="ok",
                title="Todas las imágenes tienen atributo ALT",
                message=f"Las {images_summary.total} imágenes analizadas cuentan con descripción alternativa."
            ))

        # Canonical
        if not canonical_url:
            issues.append(AuditIssue(
                category="Indexing",
                severity="warning",
                title="Falta etiqueta Canonical",
                message="No se encontró <link rel='canonical'> para prevenir problemas de contenido duplicado."
            ))
        else:
            issues.append(AuditIssue(
                category="Indexing",
                severity="ok",
                title="Etiqueta Canonical presente",
                message=f"URL canónica configurada: {canonical_url}"
            ))

        # Viewport
        if not viewport_meta:
            issues.append(AuditIssue(
                category="Indexing",
                severity="critical",
                title="Falta etiqueta meta Viewport",
                message="Sin meta viewport, la página no se adaptará correctamente a dispositivos móviles."
            ))

        # Thin content
        if content_stats.word_count < 250:
            issues.append(AuditIssue(
                category="Meta",
                severity="warning",
                title="Riesgo de Thin Content (< 250 palabras)",
                message=f"Se detectaron únicamente {content_stats.word_count} palabras de texto en el cuerpo principal."
            ))

        # Robots noindex
        if robots_meta and "noindex" in robots_meta.lower():
            issues.append(AuditIssue(
                category="Indexing",
                severity="warning",
                title="Directiva 'noindex' detectada",
                message=f"La directiva robots '{robots_meta}' impide que los motores de búsqueda indexen esta página."
            ))

        return issues


crawler_service = HttpCrawler()
