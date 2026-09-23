"""
Document rendering for Deiza deliverables — compatibility layer over `deiza_mapper`.

Everything is HTML-first now: markdown (or a page the model wrote) is rendered by
headless Chromium; the same HTML becomes the PDF, the Word document (native
runs/tables/lists/equations) and, for decks, an editable PowerPoint whose shapes,
text boxes, pictures and tables are extracted from the rendered DOM.

Public API kept from the previous implementation (ai_service / app import these):
    render_pdf, render_docx, build_pptx, render_deck_previews, load_pptx_plan,
    load_pptx_previews, parse_meta, resolve_theme, fetch_image_bytes, normalize_image,
    inline_images, is_html_document, THEMES, THEME_NAMES, UPLOADS_DIR
New:
    build_pptx_from_html, load_pptx_html, deck_prompt
"""
import json
import logging
import os
import re
import uuid

from deiza_mapper import images as _images
from deiza_mapper.themes import THEMES, THEME_NAMES, DEFAULT_THEME, parse_meta, resolve_theme  # noqa: F401
from deiza_mapper.images import fetch_image_bytes, normalize_image, inline_images, data_uri  # noqa: F401
from deiza_mapper.document import build_document_html, is_html_document  # noqa: F401
from deiza_mapper.markdown import md_to_html  # noqa: F401
from deiza_mapper.pdf import render_pdf as _render_pdf, html_to_pdf  # noqa: F401
from deiza_mapper.docx import render_docx as _render_docx, html_to_docx  # noqa: F401
from deiza_mapper.deck import plan_to_html, to_deck_html, is_deck_html, wrap_deck_fragment, sanitize_model_deck  # noqa: F401
from deiza_mapper.pptx import build_from_html
from deiza_mapper.prompts import deck_instructions as deck_prompt  # noqa: F401

logger = logging.getLogger(__name__)

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'uploads')
_images.register_local_prefix('/api/files/', UPLOADS_DIR)
# Chromium runs inside the container; images are inlined server-side, but keep the base for links
LOCAL_API_BASE = os.getenv('DOC_RENDER_API_BASE', 'http://127.0.0.1:5000')


def render_pdf(content: str, filename: str = 'documento.pdf', language: str = 'es') -> bytes:
    return _render_pdf(content, filename, language=language or 'es')


def render_docx(content: str, language: str = 'es') -> bytes:
    return _render_docx(content, language=language or 'es')


# ── decks ──────────────────────────────────────────────────────────────────
def _fid_paths(fid: str):
    base = fid[:-5] if fid.endswith('.pptx') else fid
    return base, os.path.join(UPLOADS_DIR, fid)


def _save_deck(result: dict, html: str, plan: dict = None, fid: str = None, source_html: str = None) -> str:
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    fid = fid or (uuid.uuid4().hex + '.pptx')
    base, path = _fid_paths(fid)
    with open(path, 'wb') as fh:
        fh.write(result['pptx'])
    if source_html:
        # the sanitized recipe fragment: what the model gets back when the user asks for changes
        try:
            with open(path + '.src.html', 'w', encoding='utf-8') as fh:
                fh.write(source_html)
        except Exception as e:
            logger.debug(f'deck source sidecar: {e}')
    urls = []
    for i, png in enumerate(result.get('previews') or []):
        if not png:
            continue
        name = f'{base}_s{i + 1}.png'
        with open(os.path.join(UPLOADS_DIR, name), 'wb') as fh:
            fh.write(png)
        urls.append('/api/files/' + name)
    try:
        with open(path + '.previews.json', 'w') as fh:
            json.dump(urls, fh)
        with open(path + '.html', 'w', encoding='utf-8') as fh:
            fh.write(html)
        if plan is not None:
            with open(path + '.json', 'w', encoding='utf-8') as fh:
                json.dump(plan, fh, ensure_ascii=False)
        if result.get('pdf'):
            with open(os.path.join(UPLOADS_DIR, base + '.pdf'), 'wb') as fh:
                fh.write(result['pdf'])
    except Exception as e:
        logger.debug(f'deck sidecar files: {e}')
    return fid


def build_pptx(plan: dict, user_images=None, search_image_urls=None, fetch_img_bytes=None, used_images: dict = None,
               pdf: bool = True) -> str:
    """Structured plan -> designed deck (HTML) -> .pptx + PNG previews (+ PDF). Returns the file id.
    Slides may carry `user_image` (index into user_images) or `image_query` (searched)."""
    user_images = user_images or []
    fetch_img_bytes = fetch_img_bytes or fetch_image_bytes
    slides_in = [s for s in (plan.get('slides') or []) if isinstance(s, dict)][:24]
    images = {}
    cache = {}
    for idx, s in enumerate(slides_in):
        data = None
        ui = s.get('user_image')
        if ui is not None and str(ui).strip() != '':
            try:
                k = int(ui)
                if 0 <= k < len(user_images):
                    data = user_images[k]
            except Exception:
                pass
        q = (s.get('image_query') or '').strip()
        if data is None and q and search_image_urls:
            if q in cache:
                data = cache[q]
            else:
                for cand in (search_image_urls(q, num=4) or []):
                    d = fetch_img_bytes(cand.get('url') if isinstance(cand, dict) else cand)
                    if d and len(d) > 4000 and normalize_image(d):
                        data = d
                        break
                cache[q] = data
        if data:
            images[idx] = data
    if used_images is not None:
        used_images.update(images)
    html = plan_to_html(plan, images)
    result = build_from_html(html, previews=True, pdf=pdf)
    fid = _save_deck(result, html, plan=plan)
    logger.info(f'deck built: {fid} ({result["slides"]} slides, warnings={len(result["warnings"])})')
    return fid


def build_pptx_from_html(deck_html: str, theme: str = None, title: str = None, pdf: bool = True, fid: str = None,
                         allowed_images=None, sanitize: bool = True, qa_out: list = None) -> str:
    """Model-authored slide HTML -> .pptx + previews (+ PDF). Returns the file id.

    With `sanitize` (default) the model's HTML goes through the recipe sanitizer: its own <style>,
    inline geometry and unknown classes are dropped, pictures outside `allowed_images` are removed and
    deck.css + the autofit pass own the layout. `qa_out`, when given, receives the per-slide QA list."""
    source = None
    meta = {}
    if sanitize:
        source, meta = sanitize_model_deck(deck_html, allowed_images=allowed_images)
        if not source:
            raise ValueError('deck HTML has no usable slides')
        html = wrap_deck_fragment(source, theme=meta.get('theme') or theme, accent=meta.get('accent'))
    else:
        html = to_deck_html(deck_html)
    result = build_from_html(html, previews=True, pdf=pdf)
    if qa_out is not None:
        qa_out[:] = result.get('qa') or []
    plan = {'title': title or (result['titles'][0] if result['titles'] else 'Presentacion'),
            'theme': meta.get('theme') or theme or '', 'source': 'html',
            'slides': [{'title': t} for t in result['titles']], 'qa': result.get('qa') or [], 'warnings': result['warnings']}
    fid = _save_deck(result, html, plan=plan, fid=fid, source_html=source)
    logger.info(f'deck built from html: {fid} ({result["slides"]} slides, warnings={len(result["warnings"])})')
    return fid


def render_deck_previews(plan: dict, used_images: dict, fid: str) -> list:
    """Kept for API compatibility: previews are produced by build_pptx itself."""
    return load_pptx_previews(fid)


def _sidecar(url_or_fid: str, suffix: str):
    fid = (url_or_fid or '').split('/')[-1].split('?')[0]
    if not re.match(r'^[A-Za-z0-9_.-]+$', fid):
        return None
    return os.path.join(UPLOADS_DIR, fid + suffix)


def load_pptx_plan(url_or_fid: str):
    p = _sidecar(url_or_fid, '.json')
    try:
        with open(p, encoding='utf-8') as fh:
            return json.load(fh)
    except Exception:
        return None


def load_pptx_html(url_or_fid: str):
    """Slide HTML of a previous deck for an edit round: the sanitized recipe fragment when we have it,
    otherwise the <body> of the rendered page (never the full page with its CSS)."""
    for suffix in ('.src.html', '.html'):
        p = _sidecar(url_or_fid, suffix)
        try:
            with open(p, encoding='utf-8') as fh:
                html = fh.read()
        except Exception:
            continue
        if suffix == '.html':
            m = re.search(r'<body[^>]*>(.*)</body>', html, flags=re.S | re.I)
            html = m.group(1).strip() if m else html
        return html
    return None


def load_pptx_previews(url_or_fid: str) -> list:
    p = _sidecar(url_or_fid, '.previews.json')
    try:
        with open(p) as fh:
            return json.load(fh)
    except Exception:
        return []


def deck_pdf_path(url_or_fid: str):
    fid = (url_or_fid or '').split('/')[-1].split('?')[0]
    base = fid[:-5] if fid.endswith('.pptx') else fid
    p = os.path.join(UPLOADS_DIR, base + '.pdf')
    return p if os.path.isfile(p) else None
