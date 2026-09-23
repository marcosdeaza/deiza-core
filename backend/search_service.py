"""Deiza Search — real web search, direct links and real-time data mapping."""
import json
import logging
import os
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
import urllib.request
from datetime import datetime, timezone

from ai_service import get_ai_service

logger = logging.getLogger("deiza.search")

FETCH_TIMEOUT = 8

DIRECT_DOMAINS = {
    "google": "https://www.google.com",
    "google search": "https://www.google.com",
    "gmail": "https://mail.google.com",
    "google mail": "https://mail.google.com",
    "correo de google": "https://mail.google.com",
    "google gmail": "https://mail.google.com",
    "google drive": "https://drive.google.com",
    "google docs": "https://docs.google.com",
    "google sheets": "https://sheets.google.com",
    "google maps": "https://maps.google.com",
    "google translate": "https://translate.google.com",
    "google calendar": "https://calendar.google.com",
    "google photos": "https://photos.google.com",
    "google news": "https://news.google.com",
    "google cloud": "https://cloud.google.com",
    "youtube": "https://www.youtube.com",
    "yt": "https://www.youtube.com",
    "spotify": "https://www.spotify.com",
    "twitter": "https://x.com",
    "x": "https://x.com",
    "facebook": "https://www.facebook.com",
    "instagram": "https://www.instagram.com",
    "tiktok": "https://www.tiktok.com",
    "whatsapp": "https://web.whatsapp.com",
    "telegram": "https://web.telegram.org",
    "discord": "https://discord.com",
    "twitch": "https://www.twitch.tv",
    "github": "https://github.com",
    "gitlab": "https://gitlab.com",
    "reddit": "https://www.reddit.com",
    "netflix": "https://www.netflix.com",
    "prime video": "https://www.primevideo.com",
    "hbo max": "https://www.max.com",
    "max": "https://www.max.com",
    "disney plus": "https://www.disneyplus.com",
    "amazon": "https://www.amazon.com",
    "linkedin": "https://www.linkedin.com",
    "pinterest": "https://www.pinterest.com",
    "epic games": "https://www.epicgames.com",
    "epic": "https://www.epicgames.com",
    "steam": "https://store.steampowered.com",
    "chatgpt": "https://chatgpt.com",
    "openai": "https://openai.com",
    "perplexity": "https://www.perplexity.ai",
    "wikipedia": "https://www.wikipedia.org",
    "wikimedia": "https://www.wikimedia.org",
    "microsoft": "https://www.microsoft.com",
    "apple": "https://www.apple.com",
    "tesla": "https://www.tesla.com",
    "nvidia": "https://www.nvidia.com",
    "meta": "https://www.meta.com",
    "blizzard": "https://www.blizzard.com",
    "riot games": "https://www.riotgames.com",
    "roblox": "https://www.roblox.com",
    "mozilla": "https://www.mozilla.org",
    "duckduckgo": "https://duckduckgo.com",
    "bing": "https://www.bing.com",
    "yahoo": "https://www.yahoo.com",
    "deiza": "https://deiza.org",
    "liveuamap": "https://liveuamap.com",
    "sketchfab": "https://sketchfab.com",
    "canva": "https://www.canva.com",
    "notion": "https://www.notion.so",
    "figma": "https://www.figma.com",
    "vercel": "https://vercel.com",
    "netlify": "https://www.netlify.com",
    "stack overflow": "https://stackoverflow.com",
    "stackoverflow": "https://stackoverflow.com",
    "mdn": "https://developer.mozilla.org",
    "medium": "https://medium.com",
    "ebay": "https://www.ebay.com",
    "aliexpress": "https://www.aliexpress.com",
    "gog": "https://www.gog.com",
    "itch io": "https://itch.io",
    "itch": "https://itch.io",
    "kaggle": "https://www.kaggle.com",
    "hugging face": "https://huggingface.co",
    "huggingface": "https://huggingface.co",
    "google colab": "https://colab.research.google.com",
    "colab": "https://colab.research.google.com",
    "adobe": "https://www.adobe.com",
    "vimeo": "https://vimeo.com",
    "dailymotion": "https://www.dailymotion.com",
    "soundcloud": "https://soundcloud.com",
    "deezer": "https://www.deezer.com",
    "apple music": "https://music.apple.com",
    "google play": "https://play.google.com",
    "play store": "https://play.google.com",
    "app store": "https://www.apple.com/app-store",
    "crunchyroll": "https://www.crunchyroll.com",
    "hulu": "https://www.hulu.com",
    "paramount plus": "https://www.paramountplus.com",
    "tumblr": "https://www.tumblr.com",
    "quora": "https://www.quora.com",
    "wattpad": "https://www.wattpad.com",
    "pocket": "https://getpocket.com",
    "trello": "https://trello.com",
    "slack": "https://slack.com",
    "zoom": "https://zoom.us",
    "meet": "https://meet.google.com",
    "google meet": "https://meet.google.com",
    "outlook": "https://outlook.com",
    "office": "https://www.office.com",
    "dropbox": "https://www.dropbox.com",
    "one drive": "https://onedrive.live.com",
    "onedrive": "https://onedrive.live.com",
    "clickup": "https://clickup.com",
    "asana": "https://asana.com",
    "monday": "https://monday.com",
    "airtable": "https://airtable.com",
    "supabase": "https://supabase.com",
    "firebase": "https://firebase.google.com",
    "railway": "https://railway.app",
    "render": "https://render.com",
    "cloudflare": "https://www.cloudflare.com",
    "namecheap": "https://www.namecheap.com",
    "godaddy": "https://www.godaddy.com",
    "dribbble": "https://dribbble.com",
    "behance": "https://www.behance.net",
    "unsplash": "https://unsplash.com",
    "pexels": "https://www.pexels.com",
    "flickr": "https://www.flickr.com",
    "imgur": "https://imgur.com",
    "9gag": "https://9gag.com",
    "taringa": "https://www.taringa.net",
    "fandom": "https://www.fandom.com",
    "tv tropes": "https://tvtropes.org",
    "goodreads": "https://www.goodreads.com",
    "letterboxd": "https://letterboxd.com",
    "imdb": "https://www.imdb.com",
    "rottentomatoes": "https://www.rottentomatoes.com",
    "openstreetmap": "https://www.openstreetmap.org",
    "waze": "https://www.waze.com",
    "downdetector": "https://downdetector.com",
}

_WORD_URLS = {
    "chess": "https://www.chess.com",
    "lichess": "https://lichess.org",
    "fifa": "https://www.fifa.com",
    "f1": "https://www.formula1.com",
    "formula 1": "https://www.formula1.com",
    "nba": "https://www.nba.com",
    "nfl": "https://www.nfl.com",
    "mlb": "https://www.mlb.com",
    "espn": "https://www.espn.com",
    "marca": "https://www.marca.com",
    "as": "https://as.com",
    "el pais": "https://elpais.com",
    "reuters": "https://www.reuters.com",
    "bbc": "https://www.bbc.com",
    "cnn": "https://www.cnn.com",
    "nytimes": "https://www.nytimes.com",
    "xbox": "https://www.xbox.com",
    "playstation": "https://www.playstation.com",
}


def _domain(url):
    try:
        return urllib.parse.urlparse(url).netloc.replace("www.", "")
    except Exception:
        return url


# Host of the opaque redirect links some grounding endpoints return instead of the source URL.
_GROUNDING_REDIRECT_HOST = os.getenv("SEARCH_GROUNDING_REDIRECT_HOST", "").strip() or "grounding-redirect.invalid"
_DOMAIN_LIKE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$", re.I)


def _resolve_grounding_url(uri, timeout=3.5):
    """Follow a grounding redirect link to the real page URL.
    Returns the final URL, or None if it can't be resolved in time."""
    try:
        req = urllib.request.Request(uri, method="HEAD", headers={"User-Agent": "Mozilla/5.0 (compatible; Deiza/1.0)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            final = resp.geturl()
    except Exception:
        try:
            req = urllib.request.Request(uri, headers={"User-Agent": "Mozilla/5.0 (compatible; Deiza/1.0)", "Range": "bytes=0-0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                final = resp.geturl()
        except Exception:
            return None
    if not final or _domain(final) == _GROUNDING_REDIRECT_HOST:
        return None
    return final


def _normalize_grounding_sources(raw):
    """raw: [{url, title}] straight from groundingChunks. The endpoint hands back opaque
    redirect links with the real domain only in `title`; resolve them in parallel so
    chips link to (and show) the actual site, then collapse repeats of one domain."""
    if not raw:
        return []
    redirect_idx = [i for i, s in enumerate(raw) if _domain(s["url"]) == _GROUNDING_REDIRECT_HOST]
    resolved = {}
    if redirect_idx:
        with ThreadPoolExecutor(max_workers=min(6, len(redirect_idx))) as ex:
            futs = {i: ex.submit(_resolve_grounding_url, raw[i]["url"]) for i in redirect_idx}
            for i, f in futs.items():
                try:
                    resolved[i] = f.result(timeout=4.5)
                except Exception:
                    resolved[i] = None

    out, seen = [], set()
    for i, s in enumerate(raw):
        url = resolved.get(i) or s["url"]
        title = (s.get("title") or "").strip()
        domain = _domain(url)
        if domain == _GROUNDING_REDIRECT_HOST:
            # Unresolved redirect: the title is the real domain, use it for the label.
            domain = title.lower() if _DOMAIN_LIKE.match(title) else ""
            if not domain:
                continue
        if _DOMAIN_LIKE.match(title) and (title.lower() == domain or domain.endswith("." + title.lower())):
            title = ""
        if domain in seen:
            continue
        seen.add(domain)
        out.append({"url": url, "title": title or domain, "domain": domain})
    return out


_SOCIAL_PROFILES = {
    "twitch": ("https://www.twitch.tv/", "twitch.tv"),
    "youtube": ("https://www.youtube.com/@", "youtube.com"),
    "yt": ("https://www.youtube.com/@", "youtube.com"),
    "instagram": ("https://www.instagram.com/", "instagram.com"),
    "ig": ("https://www.instagram.com/", "instagram.com"),
    "tiktok": ("https://www.tiktok.com/@", "tiktok.com"),
    "twitter": ("https://x.com/", "x.com"),
    "x": ("https://x.com/", "x.com"),
    "spotify": ("https://open.spotify.com/search/", "spotify.com"),
    "facebook": ("https://www.facebook.com/", "facebook.com"),
    "github": ("https://github.com/", "github.com"),
}

_ARTICLE_WORDS = {"el", "la", "los", "las", "del", "de", "al", "the", "a", "un", "una", "mi", "su",
                  "canal", "cuenta", "perfil", "usuario", "en"}


def _handle_from_name(text):
    words = [w for w in re.sub(r"[^a-zA-Z0-9\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00fc ]", " ", text).split()
             if w.lower() not in _ARTICLE_WORDS]
    if not words:
        return ""
    s = "".join(words).lower()
    for a, b in (("\u00e1", "a"), ("\u00e9", "e"), ("\u00ed", "i"), ("\u00f3", "o"),
                 ("\u00fa", "u"), ("\u00f1", "n"), ("\u00fc", "u")):
        s = s.replace(a, b)
    return s


def match_social_profile(query):
    q = query.lower().strip()
    if not q:
        return None
    # Anchored: "<pre>? <platform> (de|en|para|a) <name>" — full platform list
    p1 = re.match(
        r"^(?:el |la |los |las |canal de |cuenta de |perfil de |abrir |buscar(?: en)? )?"
        r"(twitch|youtube|yt|instagram|ig|tiktok|twitter|spotify|facebook|github|x)"
        r"(?: de| en| para| al| a)? (.+)$", q)
    # Unanchored: "... twitch de <name>" — safe long names only (no x/ig)
    p2 = re.search(
        r"\b(twitch|youtube|yt|instagram|tiktok|twitter|spotify|facebook|github) de (.+)$", q)
    m = p1 or p2
    if not m:
        return None
    platform = m.group(1)
    name = m.group(2).strip()
    if not name or len(name) > 40:
        return None
    if platform in ("x", "yt", "ig") and not (p1 and m.start() == 0):
        return None
    handle = _handle_from_name(name)
    if not handle or len(handle) < 2:
        return None
    base, domain = _SOCIAL_PROFILES[platform]
    return {"url": base + handle, "domain": domain}


def match_direct_link(query):
    q = query.lower().strip()
    if not q:
        return None
    for key, url in DIRECT_DOMAINS.items():
        if q == key:
            return {"url": url, "domain": _domain(url)}
    compact = re.sub(r"[^a-z0-9 ]", " ", q)
    parts = compact.split()
    for i in range(len(parts), 1, -1):
        key = " ".join(parts[:i])
        if key in DIRECT_DOMAINS:
            url = DIRECT_DOMAINS[key]
            return {"url": url, "domain": _domain(url)}
    for key, url in _WORD_URLS.items():
        if key in q and len(q) <= len(key) + 4:
            return {"url": url, "domain": _domain(url)}
    if len(parts) == 1 and re.match(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$", parts[0]) and parts[0] not in ("com", "es"):
        url = q if q.startswith("http") else "https://" + q
        return {"url": url, "domain": _domain(url)}
    return None


def clean_text(text):
    if not text:
        return ""
    t = re.sub(r"\*{1,3}", "", text)
    t = re.sub(r"^#{1,6}\s*", "", t, flags=re.M)
    t = re.sub(r"^>{1,2}\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*[-*]\s+", "\u2022 ", t, flags=re.M)
    t = re.sub(r"^---+$", "", t, flags=re.M)
    t = re.sub(r"SOURCES:.*$", "", t, flags=re.S)
    t = re.sub(r"\[(\d+)\]", r"\1", t)
    t = re.sub(r"^\s*Fuentes?[:\-]?\s*$", "", t, flags=re.M | re.I)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()

_SEARCH_SYSTEM = (
    "Eres Deiza Search, el buscador conversacional de Deiza. Respondes a la consulta del usuario "
    "exclusivamente con la información obtenida de la búsqueda en internet que tienes disponible "
    "en este mismo contexto.\n"
    "REGLAS ESTRICTAS:\n"
    "1) Escribe SIEMPRE en el idioma del usuario.\n"
    "2) PROHIBIDOS los asteriscos (**), negritas, títulos markdown y encabezados. Texto plano "
    "limpio, con párrafos cortos y puntos tipo bullet si hace falta una lista.\n"
    "3) Directo, pragmático y útil, como un buen buscador con respuestas: lo importante primero.\n"
    "4) Si la consulta es de datos actuales (resultados, partidos, bolsa, divisas, clima, "
    "noticias), usa los resultados más recientes de la búsqueda.\n"
    "5) NUNCA inventes cifras, nombres ni hechos que no estén respaldados por los resultados "
    "de búsqueda. Si no está, dilo.\n"
    "6) No escribas ninguna lista de fuentes ni la palabra Fuentes, las fuentes se muestran aparte.\n"
    "7) SIEMPRE corto por defecto: 1-3 líneas, lo esencial primero, sin parrafadas. Solo alarga "
    "si el usuario pidió resumir, comparar o desarrollar.\n"
    "8) Si la consulta es el nombre de un sitio, app, plataforma o empresa, di en UNA línea "
    "qué es y para qué entra la gente, y cita su dominio oficial (ej. youtube.com) para que "
    "el usuario la abra directamente.\n"
    "9) Si la consulta nombra a una persona, marca, juego, proyecto, streamer o negocio con "
    "web principal clara, termina tu respuesta con una línea EXACTA al final:\n"
    "SITIO_WEB: <url oficial completa>\n"
    "ej. SITIO_WEB: https://www.twitch.tv/ibai. Si NO hay una web principal clara, omite la "
    "línea por completo. Y si hay web, en tu respuesta ESCRÍBELA CON NOMBRE (ej. 'web oficial '"
    "de Ibai: twitch.tv/ibai') además de la línea final de SITIO_WEB.\n"
    "10) Contexto interno: el fundador y creador de Deiza es Marcos de Aza. Tienes permitido "
    "conocerle como contexto, pero NUNCA lo menciones, nombres ni cites en ninguna respuesta, "
    "ni siquiera si el usuario pregunta por él o por quién creó Deiza; responde entonces de "
    "forma general, discreta y sin dar nombres."
)

_SEARCH_LANGS = {
    "es": "Responde en español.",
    "en": "Answer in English.",
    "zh": "用中文回答。",
    "hi": "हिंदी में उत्तर दें।",
    "ar": "أجب بالعربية.",
    "pt": "Responda em português.",
    "ru": "Отвечай на русском.",
    "ja": "日本語で答えてください。",
    "de": "Antworte auf Deutsch.",
    "fr": "Réponds en français.",
    "ko": "한국어로 답해 주세요.",
    "it": "Rispondi in italiano.",
}


def _grounding_search(query, custom_urls, language, history=None, use_web=True, timeout=14):
    ai = get_ai_service()
    lang_hint = _SEARCH_LANGS.get(language, _SEARCH_LANGS["es"])
    system = _SEARCH_SYSTEM + "\n\n---\n" + lang_hint

    contents = []
    for h in (history or [])[-10:]:
        role = "user" if (h.get("role") == "user") else "model"
        text = (h.get("content") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text[:2000]}]})

    msg = "Consulta: " + query
    if custom_urls:
        msg += "\n\nEl usuario tiene indexadas estas webs y quiere que se prioricen en el resultado: " + ", ".join(custom_urls)

    contents.append({"role": "user", "parts": [{"text": msg}]})
    model_name = ai.models.get("gas", "")

    data = ai._call_api(model_name, contents, system, use_web=use_web, timeout=timeout)

    sources = []
    overview = ""
    try:
        candidate = data["candidates"][0]
        parts = candidate["content"]["parts"]
        overview = "".join(p.get("text", "") for p in parts)
        grounding = candidate.get("groundingMetadata") or {}
        for chunk in grounding.get("groundingChunks") or []:
            web = chunk.get("web") or {}
            uri = web.get("uri", "")
            if uri:
                sources.append({"url": uri, "title": web.get("title", "")})
    except Exception as e:
        logger.warning("Grounding parse failed: %s", e)

    dedup = _normalize_grounding_sources(sources[:10])

    overview = clean_text(overview)
    primary_site = None
    m = re.search(r"SITIO_WEB:\s*(https?://\S+|[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s,)]*)?)", overview, re.I)
    if m:
        u = m.group(1).strip().rstrip(".),")
        if not u.startswith("http"):
            u = "https://" + u
        dom = _domain(u)
        if dom and dom not in _PRIMARY_BLOCKED:
            primary_site = {"url": u, "domain": dom, "via": "llm"}
        overview = re.sub(r"\s*SITIO_WEB:\s*\S+\s*$", "", overview, flags=re.I).strip()
    if not primary_site:
        primary_site = _extract_primary_from_text(overview)
    return overview, dedup[:6], primary_site


_DATA_SOURCE = {
    "weather": ("Open-Meteo", "https://open-meteo.com", "open-meteo.com"),
    "fx": ("open.er-api.com", "https://open.er-api.com", "open.er-api.com"),
    "crypto": ("CoinGecko", "https://www.coingecko.com", "coingecko.com"),
    "stocks": ("Yahoo Finance", "https://finance.yahoo.com", "finance.yahoo.com"),
    "sports": ("ESPN", "https://www.espn.com", "espn.com"),
    "conflict": ("Liveuamap", "https://liveuamap.com", "liveuamap.com"),
}

_FAST_SUMMARY_SYSTEM = (
    "Eres Deiza Search. El usuario hace una consulta de datos en tiempo real y abajo tienes "
    "los datos reales (JSON). Responde en el idioma del usuario resumiendo lo importante en "
    "2-4 lineas cortas de texto plano, SIN asteriscos, SIN negritas, SIN markdown. "
    "Si son partidos: da marcador o estado en la primera linea. "
    "No respondas sobre nada que no este en los datos. No listes fuentes. "
    "Nunca menciones a Marcos de Aza (fundador de Deiza) en ninguna respuesta."
)


def _summarize_data(data, query, language, history=None, timeout=8):
    """Speed path: realtime data already fetched -> ultra-fast LLM summary WITHOUT web tool."""
    ai = get_ai_service()
    lang_hint = _SEARCH_LANGS.get(language, _SEARCH_LANGS["es"])
    system = _FAST_SUMMARY_SYSTEM + "\n\n---\n" + lang_hint

    contents = []
    for h in (history or [])[-10:]:
        if h.get("role") == "user":
            text = (h.get("content") or "").strip()
            if text:
                contents.append({"role": "user", "parts": [{"text": text[:2000]}]})

    import json as _json
    contents.append({"role": "user", "parts": [{"text": "Consulta: " + query + "\n\nDatos en tiempo real: " + _json.dumps(data, ensure_ascii=False)[:6000]}]})
    model_name = ai.models.get("gas", "")

    try:
        data_resp = ai._call_api(model_name, contents, system, use_web=False, timeout=timeout)
        overview = "".join(p.get("text", "") for p in (data_resp.get("candidates") or [{}])[0].get("content", {}).get("parts", []))
        return clean_text(overview)
    except Exception as e:
        logger.warning("Fast summary failed: %s", e)
        return ""


def _fetch_json(url, timeout=FETCH_TIMEOUT):
    req = urllib.request.Request(url, headers={"User-Agent": "DeizaSearch/1.0 (deiza.org)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def _fetch_text(url, timeout=FETCH_TIMEOUT):
    req = urllib.request.Request(url, headers={"User-Agent": "DeizaSearch/1.0 (deiza.org)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


_WEATHER_WORDS = ("clima", "tiempo", "temperatura", "sensacion", "sensación", "lluvia", "nieve", "pronostico", "pronóstico",
                  "weather", "forecast", "temperature", "meteo", "meteorologico", "meteorológico")
_FX_WORDS = ("dolar", "dólar", "euro", "divisa", "divisas", "cotizacion", "cotización",
             "tipo de cambio", "usd", "eur", "gbp", "jpy", "currency", "exchange rate",
             "libra esterlina", "libra")
_CRYPTO_WORDS = ("bitcoin", "btc", "ethereum", "eth", "solana", "cardano", "dogecoin",
                 "crypto", "cripto", "criptomoneda")
_STOCK_WORDS = ("bolsa", "accione", "stock", "stocks", "wall street", "nasdaq",
                "sp500", "s&p", "ibex", "dow jones", "share", "cotización de", "cotizacion de")
_SPORT_WORDS = ("partido", "marcador", "resultad", "liga", "futbol", "fútbol",
                "basket", "baloncesto", "nba", "nfl", "mlb", "tenis", "champions",
                "premier", "laliga", "la liga", "serie a", "bundesliga", "boxeo", "ufc",
                "barcelona", "real madrid", "atletico", "river", "boca", "flamengo",
                "formula 1", "fórmula 1", "verstappen", "hamilton", "atp", "grand slam",
                "chivas", "america", "santos")
_CONFLICT_WORDS = ("guerra", "conflicto", "war", "conflict", "ucrania", "ukraine", "gaza",
                   "israel", "palestina", "rusia", "russia", "putin", "zelenski", "bombardeo",
                   "battle map", "militar")


def _has_word(q: str, words) -> bool:
    """Word-boundary match with optional plural suffix (s/es).

    Prevents false positives like 'euro' matching 'europea' or 'liga' matching 'obligacion'
    while still catching plurals ('lluvias', 'euros', 'acciones').
    """
    for w in words:
        if re.search(r"\b" + re.escape(w) + r"(?:s|es)?\b", q):
            return True
    return False

_WEATHER_CODES = {
    0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado",
    45: "Niebla", 48: "Niebla helada", 51: "Llovizna ligera", 53: "Llovizna", 55: "Llovizna densa",
    61: "Lluvia ligera", 63: "Lluvia", 65: "Lluvia fuerte", 71: "Nieve ligera", 73: "Nieve",
    75: "Nieve fuerte", 80: "Chubascos", 81: "Chubascos fuertes", 82: "Tormenta",
    95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta con granizo fuerte",
}

_STOCK_MAP = {
    "apple": "AAPL", "aapl": "AAPL", "tesla": "TSLA", "tsla": "TSLA",
    "nvidia": "NVDA", "nvda": "NVDA", "google": "GOOGL", "alphabet": "GOOGL",
    "amazon": "AMZN", "meta": "META", "microsoft": "MSFT", "msft": "MSFT",
    "netflix": "NFLX", "nflx": "NFLX", "amd": "AMD", "intel": "INTC",
    "disney": "DIS", "visa": "V", "paypal": "PYPL", "uber": "UBER",
    "nike": "NKE", "spotify": "SPOT", "starbucks": "SBUX", "zoom": "ZM",
    "shopify": "SHOP", "palantir": "PLTR", "airbnb": "ABNB", "coca-cola": "KO",
}
_INDEX_MAP = {
    "ibex": "^IBEX", "sp500": "^GSPC", "s&p": "^GSPC", "nasdaq": "^IXIC",
    "dow": "^DJI", "dow jones": "^DJI", "dax": "^GDAXI", "ftse": "^FTSE",
    "nikkei": "^N225", "cac": "^FCHI",
}

_CRYPTO_ID = {
    "bitcoin": "bitcoin", "btc": "bitcoin", "ethereum": "ethereum", "eth": "ethereum",
    "solana": "solana", "cardano": "cardano", "dogecoin": "dogecoin",
}

_SOCCER_LEAGUES = {
    "champions": ("uefa.champions", "Champions League"),
    "europa league": ("uefa.europa", "Europa League"),
    "premier": ("eng.1", "Premier League"),
    "liga inglesa": ("eng.1", "Premier League"),
    "laliga": ("esp.1", "LaLiga"),
    "la liga": ("esp.1", "LaLiga"),
    "serie a": ("ita.1", "Serie A"),
    "bundesliga": ("ger.1", "Bundesliga"),
    "ligue": ("fra.1", "Ligue 1"),
    "argentina": ("arg.1", "Liga Profesional"),
    "brasil": ("bra.1", "Brasileirão"),
    "mexico": ("mex.1", "Liga MX"),
    "mls": ("usa.1", "MLS"),
    "futbol": ("esp.1", "LaLiga"),
    "fútbol": ("esp.1", "LaLiga"),
}


def _detect_weather(query):
    q = query.lower()
    if not _has_word(q, _WEATHER_WORDS):
        if not re.search(r"\d+\s*°", q):
            return None
    city = None
    m = re.search(r"\ben\s+([a-záéíóúñü\s-]{3,30}?)(?:\s*(?:hoy|mañana|ahora|esta\s*semana|el\s*fin)\s|$)", q)
    if m:
        city = m.group(1).strip().title()
    if not city:
        m = re.search(r"\b(?:clima|tiempo|weather|forecast)\s+(?:de|en|in|for)\s+([a-záéíóúñü\s-]{3,30})$", q)
        if m:
            city = m.group(1).strip().title()
    if not city:
        return None
    city = re.sub(r"\s+(?:hoy|mañana|ahora|esta\s*semana|el\s*fin|the\s*weekend|today|tomorrow)$", "", city, flags=re.I)
    if not city:
        return None
    try:
        geo = _fetch_json("https://geocoding-api.open-meteo.com/v1/search?name=" + urllib.parse.quote(city) + "&count=1&language=es&format=json")
        hit = (geo.get("results") or [None])[0]
        if not hit and len(city.split()) > 1:
            geo = _fetch_json("https://geocoding-api.open-meteo.com/v1/search?name=" + urllib.parse.quote(city.split()[0]) + "&count=1&language=es&format=json")
            hit = (geo.get("results") or [None])[0]
        if not hit:
            return None
        lat, lon = hit["latitude"], hit["longitude"]
        place = hit.get("name", city) + ", " + str(hit.get("country_code", ""))
        fc = _fetch_json(
            "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s"
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code"
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5" % (lat, lon)
        )
        cur = fc.get("current", {})
        daily = fc.get("daily", {})
        days = []
        dates = daily.get("time", [])[:5]
        for i, d in enumerate(dates):
            try:
                days.append({
                    "date": d,
                    "max": round(daily["temperature_2m_max"][i]),
                    "min": round(daily["temperature_2m_min"][i]),
                    "pop": daily["precipitation_probability_max"][i],
                })
            except (KeyError, IndexError, TypeError):
                continue
        code = cur.get("weather_code", 0)
        return {
            "type": "weather",
            "place": place,
            "temp": round(cur.get("temperature_2m", 0)),
            "feels": round(cur.get("apparent_temperature", 0)),
            "humidity": round(cur.get("relative_humidity_2m", 0)),
            "precip": round(cur.get("precipitation", 0), 1),
            "label": _WEATHER_CODES.get(code, "—"),
            "days": days,
        }
    except Exception as e:
        logger.warning("Weather fetch failed: %s", e)
        return None


def _detect_fx(query):
    q = query.lower()
    if not _has_word(q, _FX_WORDS):
        return None
    try:
        data = _fetch_json("https://open.er-api.com/v6/latest/USD")
        rates = data.get("rates") or {}
        targets = []
        names = {"eur": "euro", "gbp": "libra", "jpy": "yen", "chf": "franco",
                 "ars": "peso", "mxn": "peso", "cop": "peso", "brl": "real",
                 "clp": "peso", "pen": "sol"}
        for code in ("EUR", "GBP", "JPY", "CHF", "ARS", "MXN", "COP", "BRL", "CLP", "PEN"):
            if _has_word(q, (code.lower(), names.get(code.lower(), ""))):
                targets.append(code)
        if not targets:
            targets = ["EUR", "GBP", "ARS", "MXN", "BRL"]
        shown = [{"code": c, "rate": round(rates.get(c, 0), 3)} for c in targets if c in rates]
        return {"type": "fx", "base": "USD", "rates": shown}
    except Exception as e:
        logger.warning("FX fetch failed: %s", e)
        return None


def _detect_crypto(query):
    q = query.lower()
    coin = None
    for word, cid in _CRYPTO_ID.items():
        if _has_word(q, (word,)):
            coin = cid
            break
    if not coin and _has_word(q, ("cripto", "crypto")):
        coin = "bitcoin"
    if not coin:
        return None
    try:
        d = _fetch_json("https://api.coingecko.com/api/v3/coins/%s?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false" % coin)
        md = d.get("market_data", {})
        return {
            "type": "crypto",
            "id": coin,
            "name": d.get("name", coin),
            "symbol": (d.get("symbol") or "").upper(),
            "price_usd": md.get("current_price", {}).get("usd"),
            "change_24h": md.get("price_change_percentage_24h"),
            "market_cap": md.get("market_cap", {}).get("usd"),
        }
    except Exception as e:
        logger.warning("Crypto fetch failed: %s", e)
        return None


def _detect_stocks(query):
    q = query.lower()
    if not _has_word(q, _STOCK_WORDS):
        return None
    syms = []
    for word, sym in _STOCK_MAP.items():
        if _has_word(q, (word,)):
            syms.append(sym)
    if not syms:
        for word, sym in _INDEX_MAP.items():
            if _has_word(q, (word,)):
                syms.append(sym)
    if not syms:
        syms = ["^GSPC", "^IXIC", "^DJI"]
    syms = list(dict.fromkeys(syms))[:4]
    try:
        quotes = []
        for sym in syms:
            d = _fetch_json("https://query2.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(sym) + "?interval=1d&range=1d")
            meta = (d.get("chart", {}).get("result") or [{}])[0].get("meta") or {}
            price = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
            prev = meta.get("chartPreviousClose") or meta.get("previousClose") or price
            if not price:
                continue
            change = price - prev if prev else 0
            quotes.append({
                "symbol": sym.replace("^", "").upper(),
                "name": meta.get("shortName") or meta.get("longName") or sym.replace("^", "").upper(),
                "close": round(price, 2),
                "change": round(change, 2),
                "change_pct": round(change / prev * 100, 2) if prev else 0,
                "currency": meta.get("currency", ""),
            })
        if not quotes:
            return None
        return {"type": "stocks", "quotes": quotes}
    except Exception as e:
        logger.warning("Stocks fetch failed: %s", e)
        return None


_CLUB_ALIASES = {
    "barcelona": "Barcelona", "real madrid": "Real Madrid", "atletico de madrid": "Atletico Madrid",
    "atletico": "Atletico Madrid", "sevilla": "Sevilla", "valencia": "Valencia",
    "real betis": "Real Betis", "betis": "Real Betis", "villarreal": "Villarreal",
    "real sociedad": "Real Sociedad", "athletic": "Athletic Bilbao", "girona": "Girona",
    "osasuna": "Osasuna", "celta": "Celta Vigo", "getafe": "Getafe", "espanyol": "Espanyol",
    "mallorca": "Mallorca", "alaves": "Alaves", "rayo vallecano": "Rayo Vallecano",
    "manchester united": "Manchester United", "manchester city": "Manchester City",
    "liverpool": "Liverpool", "arsenal": "Arsenal", "chelsea": "Chelsea",
    "tottenham": "Tottenham", "newcastle": "Newcastle", "aston villa": "Aston Villa",
    "everton": "Everton", "juventus": "Juventus", "inter miami": "Inter Miami",
    "inter": "Inter", "milan": "AC Milan", "ac milan": "AC Milan", "napoli": "Napoli",
    "roma": "Roma", "lazio": "Lazio", "bayern": "Bayern Munich", "bayern munich": "Bayern Munich",
    "borussia dortmund": "Borussia Dortmund", "dortmund": "Borussia Dortmund",
    "rb leipzig": "RB Leipzig", "leipzig": "RB Leipzig", "bayer leverkusen": "Bayer Leverkusen",
    "psg": "Paris Saint-Germain", "paris saint germain": "Paris Saint-Germain",
    "marseille": "Marseille", "lyon": "Lyon", "monaco": "Monaco", "ajax": "Ajax",
    "psv": "PSV", "feyenoord": "Feyenoord", "benfica": "Benfica", "porto": "Porto",
    "sporting lisboa": "Sporting CP", "sporting": "Sporting CP", "galatasaray": "Galatasaray",
    "fenerbahce": "Fenerbahce", "boca": "Boca Juniors", "boca juniors": "Boca Juniors",
    "river": "River Plate", "river plate": "River Plate", "santos": "Santos",
    "flamengo": "Flamengo", "palmeiras": "Palmeiras", "botafogo": "Botafogo",
    "corinthians": "Corinthians", "sao paulo": "Sao Paulo", "grêmio": "Gremio",
    "chivas": "Chivas", "america": "Club America", "lakers": "LA Lakers",
    "las vegas": "LA Lakers", "warriors": "Golden State Warriors", "celtics": "Boston Celtics",
    "knicks": "New York Knicks", "chiefs": "Kansas City Chiefs", "cowboys": "Dallas Cowboys",
    "real madrid basket": "Real Madrid",
}

_COUNTRY_ALIASES = {
    "espana": "Spain", "spain": "Spain", "argentina": "Argentina", "brasil": "Brazil",
    "brazil": "Brazil", "francia": "France", "france": "France", "alemania": "Germany",
    "germany": "Germany", "inglaterra": "England", "england": "England",
    "italia": "Italy", "italy": "Italy", "portugal": "Portugal", "uruguay": "Uruguay",
    "colombia": "Colombia", "mexico": "Mexico", "méxico": "Mexico",
    "estados unidos": "USA", "eeuu": "USA", "usa": "USA", "belgica": "Belgium",
    "belgium": "Belgium", "holanda": "Netherlands", "netherlands": "Netherlands",
    "croacia": "Croatia", "croatia": "Croatia", "marruecos": "Morocco", "morocco": "Morocco",
    "japon": "Japan", "japan": "Japan", "corea": "South Korea", "south korea": "South Korea",
    "suiza": "Switzerland", "dinamarca": "Denmark", "suecia": "Sweden", "noruega": "Norway",
    "escocia": "Scotland", "galés": "Wales", "wales": "Wales", "irlanda": "Republic of Ireland",
    "polonia": "Poland", "ucrania": "Ukraine", "ukraine": "Ukraine", "rusia": "Russia",
    "russia": "Russia", "grecia": "Greece", "turquia": "Turkey", "canada": "Canada",
    "australia": "Australia", "chile": "Chile", "peru": "Peru", "ecuador": "Ecuador",
    "paraguay": "Paraguay", "bolivia": "Bolivia", "venezuela": "Venezuela",
    "honduras": "Honduras", "costa rica": "Costa Rica", "panama": "Panama",
    "guatemala": "Guatemala", "senegal": "Senegal", "nigeria": "Nigeria", "ghana": "Ghana",
    "camerun": "Cameroon", "egipto": "Egypt", "tunez": "Tunisia", "arabia saudita": "Saudi Arabia",
    "saudi arabia": "Saudi Arabia", "qatar": "Qatar", "jamaica": "Jamaica",
}

_CLUB_LEAGUES = {
    "LaLiga": "esp.1", "Real Betis": "esp.1",
}

def _teams_in_query(q):
    """Return up to 2 canonical teams/countries present in the query, longest aliases first."""
    found = []
    aliases = sorted(
        list(_CLUB_ALIASES.items()) + list(_COUNTRY_ALIASES.items()),
        key=lambda kv: -len(kv[0]),
    )
    for alias, canon in aliases:
        if _has_word(q, (alias,)) and canon not in found:
            found.append(canon)
        if len(found) >= 2:
            break
    return found


def _fetch_espn_games(sport, league_slug, timeout=6):
    try:
        return _fetch_json("https://site.api.espn.com/apis/site/v2/sports/%s/%s/scoreboard" % (sport, league_slug), timeout=timeout)
    except Exception:
        return None


def _parse_games(data, limit=6):
    games = []
    for ev in (data or {}).get("events") or []:
        comp = (ev.get("competitions") or [{}])[0]
        teams = []
        for c in comp.get("competitors") or []:
            tm = c.get("team", {})
            teams.append({
                "name": tm.get("displayName", tm.get("abbreviation", "")),
                "score": c.get("score"),
                "home": c.get("homeAway") == "home",
            })
        if len(teams) < 2:
            continue
        teams.sort(key=lambda t: not t["home"])
        games.append({
            "id": ev.get("id", ""),
            "home": teams[0]["name"],
            "away": teams[1]["name"],
            "home_score": teams[0]["score"],
            "away_score": teams[1]["score"],
            "status": (comp.get("status") or {}).get("type", {}).get("description", ""),
            "date": ev.get("date", ""),
        })
    return games[:limit]


def _try_pair_leagues(q, teams):
    """Given >=2 canonical teams, scan the leagues they likely play in until a scoreboard has both."""
    is_country = any(t in _COUNTRY_ALIASES.values() for t in teams)
    if is_country:
        cands = [("soccer", "fifa.world", "Selecciones"), ("soccer", "esp.1", "LaLiga")]
    else:
        cands = [("soccer", "esp.1", "LaLiga"), ("soccer", "eng.1", "Premier League"),
                 ("soccer", "ita.1", "Serie A"), ("soccer", "ger.1", "Bundesliga"),
                 ("soccer", "fra.1", "Ligue 1"), ("soccer", "arg.1", "Primera División"),
                 ("soccer", "bra.1", "Brasileirao"), ("soccer", "usa.1", "MLS"),
                 ("soccer", "mex.1", "Liga MX")]
    for sport, slug, label in cands:
        data = _fetch_espn_games(sport, slug)
        if not data:
            continue
        for g in _parse_games(data, 30):
            match = g["home"].lower() + " " + g["away"].lower()
            if all(t.lower() in match for t in teams):
                keep = [g for g in _parse_games(data, 30) if all(t.lower() in (g["home"].lower() + " " + g["away"].lower()) for t in teams)]
                return {"type": "sports", "league": label, "games": keep[:5]}
    return None


def _detect_sports(query):
    q = query.lower()
    has_sport_word = _has_word(q, _SPORT_WORDS)
    teams = _teams_in_query(q)

    if len(teams) >= 2:
        out = _try_pair_leagues(q, teams)
        if out and out["games"]:
            return out
        return None

    team_filter = None
    for team in ("barcelona", "real madrid", "atletico", "santos", "river", "boca",
                 "flamengo", "palmeiras", "chivas", "america", "lakers", "warriors",
                 "celtics", "knicks", "chiefs", "cowboys"):
        if _has_word(q, (team,)):
            team_filter = team
            break
    sport = "soccer"
    league = ("esp.1", "LaLiga Esp.")
    if _has_word(q, ("nba", "basket", "baloncesto", "lakers", "warriors")):
        sport, league = "nba", ("nba", "NBA")
    elif _has_word(q, ("nfl", "super bowl")):
        sport, league = "nfl", ("nfl", "NFL")
    elif _has_word(q, ("mlb", "beisbol", "béisbol")):
        sport, league = "mlb", ("mlb", "MLB")
    elif _has_word(q, ("tenis", "tennis", "atp", "grand slam")):
        sport, league = "tennis", ("atp", "ATP")
    elif _has_word(q, ("formula 1", "fórmula 1", "f1", "verstappen", "hamilton")):
        sport, league = "racing", ("f1", "F1")
    elif _has_word(q, ("boxeo", "ufc")):
        sport, league = "boxing", ("boxing", "Boxeo")
    else:
        for word, (slug, label) in _SOCCER_LEAGUES.items():
            if _has_word(q, (word,)):
                league = (slug, label)
                break
    if not has_sport_word and not team_filter:
        return None
    data = _fetch_espn_games(sport, league[0])
    if not data:
        return None
    games = _parse_games(data)
    if team_filter:
        games = [g for g in games if team_filter in g["home"].lower() or team_filter in g["away"].lower()]
    if not games:
        return None
    return {"type": "sports", "league": league[1], "games": games[:5]}


def _detect_conflict(query):
    q = query.lower()
    if not _has_word(q, _CONFLICT_WORDS):
        return None
    links = [{"name": "Liveuamap", "url": "https://liveuamap.com"}]
    if "ucrania" in q or "ukraine" in q or "rusia" in q or "russia" in q:
        links.append({"name": "Liveuamap Ucrania", "url": "https://liveuamap.com/ukraine"})
    return {"type": "conflict", "links": links}


def detect_realtime(query, history=None):
    """Run all realtime mappers IN PARALLEL - total latency = slowest mapper, not the sum."""
    mappers = (_detect_weather, _detect_fx, _detect_crypto, _detect_stocks,
               _detect_sports, _detect_conflict)

    def _safe(fn):
        try:
            return fn(query)
        except Exception as e:
            logger.warning("Realtime mapper %s failed: %s", fn.__name__, e)
            return None

    with ThreadPoolExecutor(max_workers=len(mappers)) as pool:
        results = list(pool.map(_safe, mappers))
    for out in results:
        if out:
            return out
    # Conversational memory for sports: the team/league may live in the HISTORY, not the query
    # (e.g. "mi equipo es el real madrid" then "quien gano su ultimo partido?").
    if history:
        hist_text = " ".join((h.get("content") or "") for h in history if h.get("role") == "user")[:400]
        if hist_text:
            try:
                out = _detect_sports(query + " " + hist_text)
            except Exception as e:
                logger.warning("History sports fallback failed: %s", e)
                out = None
            if out:
                return out
    return None


_SITE_HINTS = ("sitio web oficial", "web oficial", "sitio oficial", "pagina oficial",
                "página oficial", "site oficial", "official website", "official site",
                "official web", "su web", "su sitio", "web principal", "sitio oficial de")


def _extract_primary_from_text(overview):
    """Fallback: domain mentioned right after 'web/sitio oficial' in the overview text."""
    if not overview:
        return None
    low = overview.lower()
    for hint in _SITE_HINTS:
        i = low.find(hint)
        if i < 0:
            continue
        tail = overview[i + len(hint):i + len(hint) + 220]
        m = re.search(r"(?:https?://)?(?:www\.)?([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:/[^\s.,;)\]}]*)?", tail)
        if not m:
            continue
        u = m.group(0).strip()
        if not u.startswith("http"):
            u = "https://" + u
        dom = _domain(u)
        if dom and dom not in _PRIMARY_BLOCKED:
            return {"url": u, "domain": dom, "via": "llm-text"}
    return None


_PRIMARY_BLOCKED = {"", "google.com", "duckduckgo.com", "bing.com", "yahoo.com",
                        "reddit.com", "facebook.com", "twitter.com", "x.com", "youtube.com",
                        "tiktok.com", "instagram.com", "pinterest.com", "wikipedia.org",
                        "linkedin.com", _GROUNDING_REDIRECT_HOST, "searx.be"}


def _summarize_images(files, query, language, history=None, timeout=25):
    """Vision path: user attached photos -> liquid model answers about them (no web tool)."""
    ai = get_ai_service()
    lang_hint = _SEARCH_LANGS.get(language, _SEARCH_LANGS["es"])
    system = (
        "Eres Deiza Search. El usuario adjunta una o varias imagenes y pregunta sobre ellas. "
        "Responde en el idioma del usuario, directo y util, en 1-4 lineas de texto plano, "
        "sin asteriscos ni markdown. Describe solo lo que se ve realmente en las imagenes y "
        "responde a lo preguntado. Si no se distingue algo, dilo."
    ) + "\n\n---\n" + lang_hint

    contents = []
    for h in (history or [])[-6:]:
        role = "user" if h.get("role") == "user" else "model"
        text = (h.get("content") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text[:1500]}]})

    parts = []
    for f in (files or []):
        if f.get("is_image") or (f.get("mime_type") or "").startswith("image/"):
            raw = f.get("raw_bytes")
            if raw:
                parts.append({"inline_data": {"mime_type": f.get("mime_type") or "image/png",
                                              "data": raw}})
            continue
        text = (f.get("content") or "")
        if text:
            parts.append({"text": text[:3000]})
    if not parts:
        parts.append({"text": query or "Describe esta imagen"})
    elif query:
        parts.append({"text": query})
    contents.append({"role": "user", "parts": parts})

    model_name = ai.models.get("liquid", "")
    try:
        data = ai._call_api(model_name, contents, system, use_web=False, timeout=timeout)
        overview = "".join(p.get("text", "") for p in (data.get("candidates") or [{}])[0]
                           .get("content", {}).get("parts", []))
        return clean_text(overview)
    except Exception as e:
        logger.warning("Image summary failed: %s", e)
        return ""


_MARCOS_RX = re.compile(r"marcos\s+(de\s+)?aza", re.I)

# ── Shopping / product intent: returns a direct link to the marketplace
#    results for the product, instead of a definition "overview".
_SHOP_INTENT = ("comprar", "compra ", " precio", "precios", "oferta", "ofertas", "rebaja",
                "rebajas", "barato", "barata", "ganga", "donde comprar", "donde lo compro",
                "cuanto cuesta", "cuánto cuesta", "cuanto vale", "cuánto vale", "cuanto cueste",
                "link de", "en amazon", "en aliexpress", "en ebay", "en temu", "venta", "price",
                "cómpralo", "compralo", "pasame", "pásame")
_SHOP_ONLY_OFFERS = ("ofertas", "rebajas", "ofertas baratas", "barato", "ganga", "descuentos")
_SHOP_STOP = ("compra", "comprar", "compra de", "precio", "precios", "oferta", "ofertas", "barato",
              "barata", "rebaja", "rebajas", "ganga", "link", "links", "de", "el", "la", "los",
              "las", "un", "una", "unos", "unas", "me", "mandame", "mándame", "pasame", "pásame",
              "busca", "buscar", "busca en", "busco", "quiere", "quiero", "para", "vendeme", "vende",
              "del", "a", "e", "que", "en", "y", "cuanto", "cuánto", "cuesta", "comprarlo", "lo",
              "hoy", "ahora", "te", "manda", "pasa", "dame", "dánme", "sale", "venta", "vale",
              "tiene", "tener", "cuesta")
_SHOP_INFO = ("qué es", "que es", "qué es un", "que es un", "qué es una", "que es una",
              "qué significa", "que significa", "como funciona", "cómo funciona", "qué tal",
              "what is", "what's")


def _build_shop_url(market, product_words, language):
    slug = urllib.parse.quote(" ".join(product_words))
    if market == "aliexpress":
        host = "es.aliexpress.com" if language == "es" else "www.aliexpress.com"
        if not product_words:
            return f"https://{host}/", host
        return f"https://{host}/w/wholesale-{slug}.html", host
    if market == "ebay":
        cc = "es" if language == "es" else "com"
        if not product_words:
            return f"https://www.ebay.{cc}/deals", f"www.ebay.{cc}"
        return f"https://www.ebay.{cc}/sch/i.html?_nkw={slug}", f"www.ebay.{cc}"
    if market == "temu":
        if not product_words:
            return "https://www.temu.com/deals.html", "temu.com"
        return f"https://www.temu.com/search_result.html?search_key={slug}", "temu.com"
    if market == "shein":
        host = "es.shein.com" if language == "es" else "www.shein.com"
        if not product_words:
            return f"https://{host}/", host
        return f"https://{host}/search/{slug}", host
    # amazon (default)
    cc = "es" if language == "es" else "com"
    if not product_words:
        return f"https://www.amazon.{cc}/gp/goldbox", f"www.amazon.{cc}"
    return f"https://www.amazon.{cc}/s?k={slug}", f"www.amazon.{cc}"


def _detect_shopping(query, language="es"):
    low = (query or "").strip().lower()
    if not low:
        return None
    if any(low.startswith(p) for p in _SHOP_INFO):
        return None

    market = None
    for m in ("aliexpress", "amazon", "temu", "shein", "ebay"):
        if m in low:
            market = m
            break

    has_intent = any(w in low for w in _SHOP_INTENT)
    # Drop punctuation, keep meaningful product tokens
    clean = re.sub(r"[^a-záéíóúñ0-9 ]", " ", low)
    tokens = [t for t in clean.split() if t and t not in _SHOP_STOP]
    tokens = [t for t in tokens if t not in ("amazon", "aliexpress", "ebay", "temu", "shein", "amazon.es")]
    product_words = list(dict.fromkeys(tokens))

    # "amazon/aliexpress + product" alone is still a shopping request
    if not has_intent and not (market and product_words):
        return None

    # Pure offers request (no specific product) → general deals link
    if not product_words or all(w in _SHOP_ONLY_OFFERS for w in product_words):
        url, domain = _build_shop_url(market or "amazon", [], language)
        return {"url": url, "domain": domain}

    url, domain = _build_shop_url(market or "amazon", product_words, language)
    return {"url": url, "domain": domain}


# ---- Image search ------------------------------------------------------------------------------
# Words that carry the *intent* of a query ("historia", "qué es", "cómo funciona"...) rather than
# its subject. They are stripped before hitting the image engines: "torre eiffel historia" must
# search "torre eiffel", otherwise Commons/Bing match "historia" against unrelated monuments.
_IMG_INTENT_WORDS = frozenset("""
historia historico historica histórico histórica origen origenes orígenes biografia biografía
que qué quien quién quienes quiénes cual cuál cuales cuáles como cómo cuando cuándo donde dónde
porque porqué es son era eran fue fueron esta está estan están hay tiene tienen tenia tenía
hace hacer hizo puede pueden pasa paso pasó ocurre ocurrio ocurrió sucede sucedio sucedió
significa significado definicion definición explicacion explicación explica explicame explícame
resumen resumido resume breve corto largo completo detallado
noticias noticia novedades actualidad actual hoy ayer ultima última ultimas últimas hora
informacion información info datos dato curiosidades caracteristicas características
funciona funcionamiento funcionan sirve sirven construyo construyó construyeron construyen construye construir construida construido
hicieron hecho hecha empezo empezó empezaron termino terminó terminaron murio murió nacio nació
ejemplo ejemplos tipos tipo ventajas desventajas precio precios opiniones opinion opinión
analisis análisis comparativa diferencia diferencias guia guía tutorial pasos consejos
dime cuentame cuéntame hablame háblame busca buscar buscame búscame muestra muestrame muéstrame
quiero saber necesito sobre acerca imagen imagenes imágenes foto fotos
history what is are was were how when where why who which whose does do did has have had
summary explain explanation meaning definition define news latest today information info facts
about overview guide tutorial examples example types tips tell me show find search
built works work review reviews price prices difference between versus vs
image images photo photos picture pictures
""".split())

# Function words: dropped from the edges of the subject and never used for matching.
_IMG_STOP_WORDS = frozenset("""
el la los las un una unos unas de del al a en y e o u con sin por para entre desde hasta
lo le les su sus mi mis tu tus se me te nos ni
the an of in on at for to and or with from by as its
""".split())

# Engines that actually return photos *of the subject*. The default `categories=images` set also
# queries wikicommons.images (full-text over file descriptions: "torre eiffel historia" -> Portuguese
# war memorials), artic (matches artist names), pinterest (empty titles, hotlink-hostile), icon packs...
# Google/DuckDuckGo get suspended by their upstream now and then; SearXNG simply skips them.
_IMG_ENGINES = 'bing images,google images,openverse,flickr'
# Web engines rank by what the concept *means* (napoleón -> Bonaparte); openverse/flickr match the word
# literally against user uploads (a basset hound called Napoleón), so they only fill the gaps.
_IMG_WEB_ENGINES = ('bing images', 'google images')

_IMG_SEARX_LANG = {
    'es': 'es-ES', 'en': 'en-US', 'zh': 'zh-CN', 'hi': 'hi-IN', 'ar': 'ar-EG', 'pt': 'pt-PT',
    'ru': 'ru-RU', 'ja': 'ja-JP', 'de': 'de-DE', 'fr': 'fr-FR', 'ko': 'ko-KR', 'it': 'it-IT',
}

_WORD_RX = re.compile(r"[^\W_]+", re.UNICODE)


def _fold(word: str) -> str:
    """lowercase + accents stripped: 'Luís' -> 'luis'."""
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFKD', word.lower()) if not unicodedata.combining(c))


def _image_subject(query: str) -> str:
    """Reduce a query to the thing to photograph: "torre eiffel historia" -> "torre eiffel",
    "¿qué es la fotosíntesis?" -> "fotosíntesis", "machu picchu cuándo se construyó" -> "machu picchu".
    Intent words go anywhere; function words only fall off the edges ("volcán de la palma" survives)."""
    words = [w for w in _WORD_RX.findall(query or '') if _fold(w) not in _IMG_INTENT_WORDS]
    while words and _fold(words[0]) in _IMG_STOP_WORDS:
        words.pop(0)
    while words and _fold(words[-1]) in _IMG_STOP_WORDS:
        words.pop()
    subject = ' '.join(words)
    if len(subject) < 3:   # nothing but intent words ("qué hora es") — search the raw text
        return (query or '').strip()
    return subject


def _subject_tokens(subject: str) -> list:
    """Folded content tokens of the subject, used to check that a result is about it."""
    toks = []
    for w in _WORD_RX.findall(subject):
        f = _fold(w)
        if len(f) >= 2 and f not in _IMG_STOP_WORDS and f not in _IMG_INTENT_WORDS:
            toks.append(f)
    if not toks:
        toks = [_fold(w) for w in _WORD_RX.findall(subject) if len(w) >= 2]
    return list(dict.fromkeys(toks))


def _token_hits(tokens: list, haystack: set) -> int:
    """How many subject tokens appear in the haystack. Prefix matches cover plurals/inflections
    (torre/torres, pirámide/pirámides) but not unrelated longer words (foto vs fotosíntesis)."""
    hits = 0
    for t in tokens:
        for h in haystack:
            if h == t:
                hits += 1
                break
            short, long_ = (t, h) if len(t) <= len(h) else (h, t)
            if len(short) >= 4 and len(long_) - len(short) <= 3 and long_.startswith(short):
                hits += 1
                break
    return hits


def _search_images(query: str, num: int = 4, language: str = 'es') -> list:
    """Query SearXNG for image results. Returns a list of VERIFIED real
    image {url, title, source} dicts — mirror of the AI service's image search
    (Wikipedia/Wikimedia preferred, every URL connectivity-checked).

    The engines see only the subject of the query, and every candidate must share at least one
    subject token with its title/page/file name — the rest are ranked by how many they share."""
    from ai_service import _check_url_ok
    import requests as _req
    try:
        subject = _image_subject(query)
        tokens = _subject_tokens(subject)
        params = {
            'q': subject,
            'format': 'json',
            'engines': _IMG_ENGINES,      # NOT `categories`: that would re-add every image engine
            'language': _IMG_SEARX_LANG.get(language, 'es-ES'),
            'safesearch': '1',
            'timeout_limit': '3',         # bing answers in <1 s; do not wait for a slow flickr
        }
        r = _req.get('http://searxng:8080/search', params=params, timeout=8)
        if not r.ok:
            return []
        results = r.json().get('results', [])
        candidates = []
        seen = set()
        for idx, res in enumerate(results[:40]):
            img_url = (res.get('img_src') or res.get('thumbnail_src')
                       or res.get('thumbnail') or '').strip()
            if img_url.startswith('//'):   # flickr returns protocol-relative URLs
                img_url = 'https:' + img_url
            if not img_url or img_url in seen:
                continue
            if not img_url.startswith('http'):
                continue
            low = img_url.lower()
            if any(x in low for x in ['favicon', '1x1', 'pixel', 'blank', 'spacer',
                                      '/icon', 'logo', 'placeholder', 'no-image',
                                      'avatar', 'beacon', 'analytics', 'track']):
                continue
            seen.add(img_url)
            try:
                from deiza_mapper.images import wikimedia_thumb as _wthumb, is_stock_url as _is_stock
                if _is_stock(img_url, res.get('url')):
                    continue   # watermarked stock previews
                img_url = _wthumb(img_url)   # originals can be 10+ MB; the 1280px thumb loads instantly
            except Exception:
                pass
            title = (res.get('title') or '').strip()
            title_toks = {_fold(w) for w in _WORD_RX.findall(title)}
            # page URL + file name + snippet catch English-titled Commons/Flickr files of Spanish subjects
            extra = ' '.join([urllib.parse.unquote(res.get('url') or ''),
                              urllib.parse.unquote(img_url), res.get('content') or ''])
            haystack = title_toks | {_fold(w) for w in _WORD_RX.findall(extra)}
            hits = _token_hits(tokens, haystack)
            if not hits:
                continue   # a photo that never mentions the subject is a photo of something else
            score = 10.0 * hits / max(len(tokens), 1)
            if _token_hits(tokens, title_toks):
                score += 1.0
            if any(e in _IMG_WEB_ENGINES for e in (res.get('engines') or [])):
                score += 2.0
            if 'wikipedia.org' in low or 'wikimedia.org' in low:
                score += 1.0
            elif low.startswith('https'):
                score += 0.5
            score -= idx * 0.02   # engine order breaks ties
            candidates.append({
                'url': img_url,
                'title': title[:100],
                'source': (res.get('url') or '')[:200],
                '_score': score,
            })
        candidates.sort(key=lambda c: c['_score'], reverse=True)
        verified = []
        # connectivity checks run in parallel batches so a dead host costs 2 s, not 2 s per URL
        pool = candidates[:num * 3]
        for start in range(0, len(pool), num * 2):
            batch = pool[start:start + num * 2]
            with ThreadPoolExecutor(max_workers=len(batch)) as ex:
                oks = list(ex.map(lambda c: _check_url_ok(c['url'], timeout=2.0), batch))
            for c, ok in zip(batch, oks):
                if ok and len(verified) < num:
                    c.pop('_score', None)
                    verified.append(c)
            if len(verified) >= num:
                break
        logger.info('Image search %r -> %r: %d results, %d candidates, %d verified',
                    query, subject, len(results), len(candidates), len(verified))
        return verified
    except Exception as e:
        logger.warning('Image search failed for %r: %s', query, e)
        return []


def _text_search(query: str, num: int = 8) -> list:
    """Plain-text SearXNG results {title, url, snippet} — grounding fallback."""
    import requests as _req
    try:
        params = {'q': query, 'format': 'json', 'language': 'es-ES'}
        r = _req.get('http://searxng:8080/search', params=params, timeout=12)
        if not r.ok:
            return []
        out, seen = [], set()
        for res in r.json().get('results', [])[:num]:
            url = (res.get('url') or '').strip()
            if not url or url in seen or not url.startswith('http'):
                continue
            seen.add(url)
            out.append({
                'title': (res.get('title') or '')[:160],
                'url': url[:400],
                'snippet': (res.get('content') or '')[:400],
            })
        return out
    except Exception:
        return []


def _fallback_overview(query: str, results: list, language: str) -> str:
    """Cheap overview from raw snippets when grounding is down."""
    ai = get_ai_service()
    lang_hint = _SEARCH_LANGS.get(language, _SEARCH_LANGS['es'])
    system = _SEARCH_SYSTEM + "\n\n---\n" + lang_hint
    blocks = []
    for i, res in enumerate(results[:6], 1):
        blocks.append(f"{i}. {res['title']}\nURL: {res['url']}\n{res['snippet']}")
    contents = [{'role': 'user', 'parts': [{
        'text': 'Consulta: ' + query + '\n\nResultados de búsqueda:\n' + '\n\n'.join(blocks)
    }]}]
    model_name = ai.models.get('gas', '')
    try:
        data = ai._call_api(model_name, contents, system, use_web=False, timeout=12)
        overview = "".join(p.get('text', '') for p in (data.get('candidates') or [{}])[0]
                           .get('content', {}).get('parts', []))
        return clean_text(overview)
    except Exception as e:
        logger.warning('Fallback overview failed: %s', e)
        return ''


def run_search(query, custom_urls=None, language="es", history=None, files=None):
    query = (query or "").strip()
    if _MARCOS_RX.search(query):
        return {"ai_overview": "No se facilita información personal sobre los fundadores de Deiza. Puedo ayudarte a buscar otras cosas: noticias, webs, perfiles sociales, música…", "sources": [], "primary_site": None}
    custom_urls = [u.strip().lstrip("www.") for u in (custom_urls or []) if u and u.strip()]
    if not query and not files:
        return {"error": "La búsqueda no puede estar vacía"}

    has_images = any(f.get("is_image") or (f.get("mime_type") or "").startswith("image/")
                     for f in (files or []))
    if has_images:
        overview = _summarize_images(files, query, language, history)
        if not overview:
            return {"error": "No se pudo analizar la imagen. Inténtalo de nuevo.",
                    "direct_link": None, "data": None, "primary_site": None}
        return {"ai_overview": overview, "sources": [], "data": None, "direct_link": None,
                "primary_site": None}

    direct = match_direct_link(query)
    if direct:
        return {"direct_link": direct}

    shop = _detect_shopping(query, language)
    if shop:
        return {"direct_link": shop}

    social = match_social_profile(query)
    if social:
        return {"direct_link": social}

    import threading
    _img_holder: list = []
    _img_done = threading.Event()

    def _fetch_imgs():
        try:
            _img_holder.extend(_search_images(query, 4, language))
        except Exception:
            pass
        finally:
            _img_done.set()

    _t_img = threading.Thread(target=_fetch_imgs, daemon=True)
    _t_img.start()

    data = detect_realtime(query, history=history)

    if data:
        _img_done.wait(timeout=3)
        overview = _summarize_data(data, query, language, history)
        title, url, domain = _DATA_SOURCE.get(data.get("type"), ("", "", ""))
        sources = [{"url": url, "title": title, "domain": domain}] if url else []
        return {"ai_overview": overview, "sources": sources, "data": data, "direct_link": None,
                "primary_site": None, "images": _img_holder}

    try:
        overview, sources, primary_site = _grounding_search(query, custom_urls, language, history=history)
    except Exception as e:
        logger.error("Grounding search failed: %s", e)
        overview, sources, primary_site = "", [], None

    if not overview and not sources and not primary_site:
        # Grounding rate-limited/down — fall back to plain SearXNG text
        fb_results = _text_search(query)
        if fb_results:
            sources = [{'url': r['url'], 'title': r['title'], 'domain': _domain(r['url'])}
                       for r in fb_results[:6]]
            overview = _fallback_overview(query, fb_results, language)
            if overview:
                primary_site = None
                m = re.search(r"SITIO_WEB:\s*(https?://\S+|[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s,)]*)?)", overview, re.I)
                if m:
                    u = m.group(1).strip().rstrip(".),")
                    if not u.startswith("http"):
                        u = "https://" + u
                    dom = _domain(u)
                    if dom and dom not in _PRIMARY_BLOCKED:
                        primary_site = {"url": u, "domain": dom, "via": "llm"}
                    overview = re.sub(r"\s*SITIO_WEB:\s*\S+\s*$", "", overview, flags=re.I).strip()
                elif not primary_site:
                    primary_site = _extract_primary_from_text(overview)

    if not overview and not sources and not primary_site:
        return {
            "error": "No se pudo completar la búsqueda. Inténtalo de nuevo.",
            "direct_link": None,
            "data": None,
            "primary_site": None,
        }

    _img_done.wait(timeout=6)
    return {"ai_overview": overview, "sources": sources, "data": None, "direct_link": None,
            "primary_site": primary_site, "images": _img_holder}
