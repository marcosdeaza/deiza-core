#!/usr/bin/env python3
"""Deiza API docs: one Markdown source per language -> static, crawlable HTML + llms.txt +
llms-full.txt + openapi.json. No JavaScript is needed to read anything (it only adds the
copy buttons). Usage: python3 build.py OUT_DIR   (needs `pip install markdown`)."""
import html
import json
import os
import re
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out')
SITE = 'https://deiza.org'
UPDATED = '2026-10-04'

LANGS = {
    'es': {
        'src': 'api.es.md', 'md_url': '/docs/api.es.md', 'path': '/docs/', 'html_lang': 'es',
        'title': 'API de Deiza · Documentación',
        'desc': 'Documentación pública de la API de Deiza: compatible con OpenAI Chat Completions, modelos Liquid 5.1, Solid 5 y Gas 4.5, autenticación, streaming, visión, herramientas, búsqueda web, límites y errores.',
        'kicker': 'Documentación · API v1', 'toc': 'En esta página', 'machine': 'Para máquinas',
        'keys': 'Claves de API', 'plans': 'Planes', 'other': ('English', '/docs/en/'),
        'copy': 'Copiar', 'copied': 'Copiado', 'copy_page': 'Copiar página como Markdown', 'copied_page': 'Markdown copiado',
        'menu': 'Índice', 'updated': 'Actualizado el 4 de octubre de 2026', 'back': 'Volver a Deiza',
    },
    'en': {
        'src': 'api.en.md', 'md_url': '/docs/api.md', 'path': '/docs/en/', 'html_lang': 'en',
        'title': 'Deiza API · Documentation',
        'desc': 'Public documentation of the Deiza API: OpenAI Chat Completions compatible, Liquid 5.1, Solid 5 and Gas 4.5 models, authentication, streaming, vision, tools, web search, limits and errors.',
        'kicker': 'Documentation · API v1', 'toc': 'On this page', 'machine': 'Machine-readable',
        'keys': 'API keys', 'plans': 'Plans', 'other': ('Español', '/docs/'),
        'copy': 'Copy', 'copied': 'Copied', 'copy_page': 'Copy page as Markdown', 'copied_page': 'Markdown copied',
        'menu': 'Contents', 'updated': 'Updated 4 October 2026', 'back': 'Back to Deiza',
    },
}

ROSE = ('<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="currentColor" opacity=".12"/>'
        '<path d="M16 7c3.6 0 6.5 2.6 6.5 6.2 0 2.9-2 4.9-4.6 4.9-2.1 0-3.7-1.5-3.7-3.5 0-1.6 1.2-2.8 2.7-2.8" '
        'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
        '<path d="M9.5 15.5c0 4.6 2.9 8.5 6.5 8.5s6.5-3.9 6.5-8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
        '<path d="M16 24v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>')


def enhance(body, t):
    # code blocks: header with language + copy button (button works only with JS)
    def code(m):
        lang = m.group(1) or 'text'
        return (f'<div class="code"><div class="code-h"><span>{lang}</span>'
                f'<button class="copy" type="button" data-label="{t["copy"]}" data-done="{t["copied"]}">{t["copy"]}</button></div>'
                f'<pre><code class="language-{lang}">')
    body = re.sub(r'<pre><code class="language-([\w+-]+)">', code, body)
    body = body.replace('</code></pre>', '</code></pre></div>')
    # tables scroll on small screens; a header row of empty cells is a key/value table
    body = re.sub(r'<table>\s*<thead>\s*<tr>(\s*<th>\s*</th>)+\s*</tr>\s*</thead>', '<table class="kv">', body)
    body = body.replace('<table', '<div class="table"><table').replace('</table>', '</table></div>')
    # "POST /chat/completions" alone in a paragraph -> endpoint line
    body = re.sub(r'<p><code>(GET|POST|PUT|PATCH|DELETE) (/[^<]*)</code></p>',
                  lambda m: f'<p class="endpoint"><span class="method {m.group(1).lower()}">{m.group(1)}</span><code>{m.group(2)}</code></p>', body)
    return body


def toc_html(toc_tokens):
    out = []
    # toc_depth 2-3: the top level is already the h2s (the h1 is not listed)
    for h2 in toc_tokens:
        out.append(f'<a href="#{h2["id"]}">{html.escape(h2["name"])}</a>')
        for h3 in h2.get('children', []):
            out.append(f'<a class="sub" href="#{h3["id"]}">{html.escape(h3["name"])}</a>')
    return '\n'.join(out)


CSS = r'''
:root{--bg:hsl(35 20% 91%);--fg:hsl(18 8% 15%);--card:hsl(40 25% 96%);--muted:hsl(35 18% 86%);--muted-fg:hsl(18 10% 34%);
--faint:hsl(18 8% 48%);--rule:hsl(30 30% 70% / .55);--primary:hsl(354 50% 37%);--primary-soft:hsl(354 50% 37% / .09);
--ochre:hsl(30 45% 38%);--ink:hsl(20 12% 12%);--ink-fg:hsl(32 22% 86%);--ink-rule:hsl(30 12% 22%);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:hsl(20 10% 9%);--fg:hsl(30 20% 90%);--card:hsl(20 10% 12.5%);--muted:hsl(20 10% 17%);
--muted-fg:hsl(30 14% 66%);--faint:hsl(30 10% 50%);--rule:hsl(30 14% 24%);--primary:hsl(354 52% 58%);--primary-soft:hsl(354 50% 50% / .12);
--ochre:hsl(32 42% 62%);--ink:hsl(20 12% 6.5%);--ink-fg:hsl(32 22% 86%);--ink-rule:hsl(30 12% 18%);color-scheme:dark}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-padding-top:84px}
body{margin:0;background:var(--bg);color:var(--fg);font:15.5px/1.72 Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:var(--primary);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--primary) 35%,transparent);text-underline-offset:3px}
a:hover{text-decoration-color:var(--primary)}
.top{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:14px;height:60px;padding:0 22px;
background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--rule)}
.brand{display:flex;align-items:center;gap:9px;color:var(--fg);text-decoration:none}
.brand svg{width:26px;height:26px;color:var(--primary)}
.brand b{font:500 20px/1 "Playfair Display",Georgia,serif;letter-spacing:-.01em}
.brand i{font:600 10.5px/1 Inter,sans-serif;font-style:normal;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-left:4px}
.top nav{margin-left:auto;display:flex;align-items:center;gap:4px}
.top nav a{font-size:13px;color:var(--muted-fg);text-decoration:none;padding:6px 10px;border-radius:999px}
.top nav a:hover{background:var(--muted);color:var(--fg)}
.top nav a.cta{background:var(--primary);color:hsl(36 30% 96%)}
.top nav a.cta:hover{filter:brightness(1.08);background:var(--primary);color:hsl(36 30% 96%)}
.shell{display:grid;grid-template-columns:250px minmax(0,1fr);gap:56px;max-width:1180px;margin:0 auto;padding:0 28px}
.toc{position:sticky;top:60px;align-self:start;max-height:calc(100vh - 60px);overflow:auto;padding:34px 0 40px}
.toc p{margin:0 0 10px;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.toc nav a{display:block;padding:4px 0 4px 12px;border-left:1px solid var(--rule);font-size:13.5px;line-height:1.4;color:var(--muted-fg);text-decoration:none}
.toc nav a.sub{padding-left:24px;font-size:12.5px}
.toc nav a:hover,.toc nav a.on{color:var(--fg);border-left-color:var(--primary)}
.toc .machine{margin-top:26px;padding-top:18px;border-top:1px solid var(--rule)}
.toc .machine a{display:block;font:12.5px/1.9 "JetBrains Mono",ui-monospace,monospace;color:var(--ochre);text-decoration:none}
.toc .machine a:hover{text-decoration:underline}
details.mtoc{display:none}
main{min-width:0;max-width:790px;padding:44px 0 90px}
.kicker{margin:0 0 14px;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--primary)}
h1,h2,h3{font-family:"Playfair Display",Georgia,serif;font-weight:500;letter-spacing:-.015em;line-height:1.15;color:var(--fg)}
h1{font-size:clamp(38px,5.4vw,56px);margin:0 0 18px}
h1+p{font-size:18px;line-height:1.6;color:var(--muted-fg);max-width:640px}
h2{font-size:30px;margin:64px 0 14px;padding-top:26px;border-top:1px solid var(--rule)}
h3{font-size:21px;margin:38px 0 10px}
h2 a.anchor,h3 a.anchor{visibility:hidden;margin-left:8px;color:var(--faint);text-decoration:none;font-family:Inter,sans-serif;font-size:.6em}
h2:hover a.anchor,h3:hover a.anchor{visibility:visible}
p,ul,ol{margin:0 0 14px}li{margin:4px 0}li::marker{color:var(--ochre)}
strong{font-weight:600}
code{font:500 .86em/1.5 "JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--primary-soft);color:var(--fg);padding:.12em .38em;border-radius:5px}
.code{margin:16px 0 22px;border-radius:14px;overflow:hidden;background:var(--ink);border:1px solid var(--ink-rule)}
.code-h{display:flex;align-items:center;justify-content:space-between;padding:7px 14px;border-bottom:1px solid var(--ink-rule);
font:600 10.5px/1 Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:hsl(30 12% 58%)}
.copy{display:none;font:500 11.5px/1 Inter,sans-serif;letter-spacing:0;text-transform:none;color:hsl(30 14% 70%);background:transparent;
border:1px solid var(--ink-rule);border-radius:7px;padding:5px 9px;cursor:pointer}
.js .copy{display:inline-block}.copy:hover{color:hsl(32 22% 92%);border-color:hsl(30 12% 34%)}
pre{margin:0;padding:15px 16px;overflow-x:auto}
pre code{background:none;padding:0;border-radius:0;color:var(--ink-fg);font-size:12.8px;line-height:1.68;font-weight:400}
.table{margin:14px 0 22px;overflow-x:auto;border:1px solid var(--rule);border-radius:14px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.5}
th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);padding:10px 14px;border-bottom:1px solid var(--rule)}
td{padding:9px 14px;border-top:1px solid var(--rule);vertical-align:top}
tr:first-child td{border-top:0}thead+tbody tr:first-child td{border-top:0}
td code{white-space:nowrap}
table.kv td:first-child{width:170px;color:var(--muted-fg);font-weight:500}
.endpoint{display:flex;align-items:center;gap:10px;margin:6px 0 18px}
.endpoint code{background:none;padding:0;font-size:15px}
.method{font:700 11px/1 "JetBrains Mono",monospace;letter-spacing:.06em;padding:5px 8px;border-radius:6px;color:hsl(36 30% 96%)}
.method.post{background:var(--primary)}.method.get{background:var(--ochre)}
.pagebar{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 6px}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;padding:6px 12px;border-radius:999px;border:1px solid var(--rule);
color:var(--muted-fg);text-decoration:none;background:transparent;cursor:pointer;font-family:inherit}
.pill:hover{color:var(--fg);border-color:var(--faint)}
button.pill{display:none}.js button.pill{display:inline-flex}
footer{border-top:1px solid var(--rule);margin-top:40px;padding:26px 0 0;font-size:12.5px;color:var(--faint)}
footer a{color:var(--muted-fg)}
@media (max-width:960px){.shell{grid-template-columns:minmax(0,1fr);gap:0;padding:0 16px}.toc{display:none}
details.mtoc{display:block;margin:18px 0 0;border:1px solid var(--rule);border-radius:12px;background:var(--card)}
details.mtoc summary{padding:10px 14px;font-size:13px;font-weight:500;cursor:pointer}
details.mtoc nav{padding:0 14px 12px}details.mtoc nav a{display:block;padding:4px 0;font-size:13.5px;color:var(--muted-fg);text-decoration:none}
details.mtoc nav a.sub{padding-left:14px;font-size:12.5px}
main{padding-top:20px}.top{padding:0 16px}.top nav a:not(.cta):not(.lang){display:none}h2{font-size:26px;margin-top:48px}}
@media print{.top,.toc,.copy,.pagebar{display:none}.shell{display:block}.code{border:1px solid #999}}
'''

JS = r'''
document.documentElement.classList.add('js');
document.addEventListener('click',async e=>{
  const b=e.target.closest('.copy');
  if(b){const code=b.closest('.code').querySelector('code').innerText;try{await navigator.clipboard.writeText(code);b.textContent=b.dataset.done;setTimeout(()=>b.textContent=b.dataset.label,1400)}catch(_){}}
  const p=e.target.closest('[data-copy-md]');
  if(p){try{const t=await (await fetch(p.dataset.copyMd)).text();await navigator.clipboard.writeText(t);const l=p.textContent;p.textContent=p.dataset.done;setTimeout(()=>p.textContent=l,1600)}catch(_){location.href=p.dataset.copyMd}}
});
const links=[...document.querySelectorAll('.toc nav a')];const map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
const io=new IntersectionObserver(es=>{for(const en of es){if(en.isIntersecting){links.forEach(a=>a.classList.remove('on'));const a=map.get(en.target.id);if(a)a.classList.add('on')}}},{rootMargin:'-80px 0px -70% 0px'});
document.querySelectorAll('main h2[id],main h3[id]').forEach(h=>io.observe(h));
'''


def page(lang, t, body, toc):
    other_label, other_path = t['other']
    alt_lang = 'en' if lang == 'es' else 'es'
    ld = {
        '@context': 'https://schema.org', '@type': 'TechArticle', 'headline': t['title'], 'description': t['desc'],
        'inLanguage': lang, 'dateModified': UPDATED, 'url': SITE + t['path'],
        'publisher': {'@type': 'Organization', 'name': 'DeizaLab', 'url': SITE},
        'isAccessibleForFree': True,
    }
    return f'''<!doctype html>
<html lang="{t['html_lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(t['title'])}</title>
<meta name="description" content="{html.escape(t['desc'])}">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="{SITE}{t['path']}">
<link rel="alternate" hreflang="{lang}" href="{SITE}{t['path']}">
<link rel="alternate" hreflang="{alt_lang}" href="{SITE}{other_path}">
<link rel="alternate" type="text/markdown" href="{t['md_url']}" title="Markdown">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
<link rel="service-desc" type="application/json" href="/openapi.json">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="article">
<meta property="og:title" content="{html.escape(t['title'])}">
<meta property="og:description" content="{html.escape(t['desc'])}">
<meta property="og:url" content="{SITE}{t['path']}">
<meta name="theme-color" content="#1c1917" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#ece8e2" media="(prefers-color-scheme: light)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header class="top">
  <a class="brand" href="/" title="{t['back']}">{ROSE}<b>Deiza</b><i>API</i></a>
  <nav>
    <a href="/plans">{t['plans']}</a>
    <a class="lang" href="{other_path}" hreflang="{alt_lang}">{other_label}</a>
    <a class="cta" href="/api-keys">{t['keys']}</a>
  </nav>
</header>
<div class="shell">
  <aside class="toc">
    <p>{t['toc']}</p>
    <nav>{toc}</nav>
    <div class="machine"><p>{t['machine']}</p>
      <a href="/llms.txt">llms.txt</a><a href="/llms-full.txt">llms-full.txt</a><a href="/openapi.json">openapi.json</a><a href="{t['md_url']}">{t['md_url'].split('/')[-1]}</a>
    </div>
  </aside>
  <main>
    <p class="kicker">{t['kicker']}</p>
    <details class="mtoc"><summary>{t['menu']}</summary><nav>{toc}</nav></details>
{body}
    <footer>{t['updated']} · <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a> · <a href="{t['md_url']}">Markdown</a> · <a href="/">deiza.org</a></footer>
  </main>
</div>
<script>{JS}</script>
</body>
</html>
'''


def build_page(lang):
    t = LANGS[lang]
    src = open(os.path.join(HERE, t['src']), encoding='utf-8').read()
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc'],
                           extension_configs={'toc': {'permalink': '#', 'permalink_class': 'anchor', 'toc_depth': '2-3'}})
    body = md.convert(src)
    body = enhance(body, t)
    # the h1 has no permalink; the intro gets the copy-as-Markdown bar after the first table
    body = re.sub(r'<h1 id="[^"]*">(.*?)<a class="anchor"[^>]*>#</a></h1>', r'<h1>\1</h1>', body, count=1)
    bar = (f'<div class="pagebar"><a class="pill" href="{t["md_url"]}">Markdown</a><a class="pill" href="/llms.txt">llms.txt</a>'
           f'<a class="pill" href="/openapi.json">OpenAPI</a>'
           f'<button class="pill" type="button" data-copy-md="{t["md_url"]}" data-done="{t["copied_page"]}">{t["copy_page"]}</button></div>')
    body = body.replace('</h1>', '</h1>' + bar, 1)
    html_out = page(lang, t, body, toc_html(md.toc_tokens))
    path = os.path.join(OUT, t['path'].strip('/'), 'index.html')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(html_out)
    return src


def openapi():
    err = {'$ref': '#/components/schemas/Error'}
    def resp(desc, schema=None):
        r = {'description': desc}
        if schema:
            r['content'] = {'application/json': {'schema': schema}}
        return r
    errors = {k: resp(v, err) for k, v in {
        '400': 'Invalid request', '401': 'Missing, invalid, revoked or expired API key', '403': 'The plan does not include the model',
        '404': 'Unknown model', '429': 'Usage limit or model sub-limit reached (see Retry-After)', '500': 'Server error'}.items()}
    msg = {'type': 'object', 'required': ['role'], 'properties': {
        'role': {'type': 'string', 'enum': ['system', 'user', 'assistant', 'tool']},
        'content': {'oneOf': [{'type': 'string'}, {'type': 'array', 'items': {'type': 'object', 'properties': {
            'type': {'type': 'string', 'enum': ['text', 'image_url']}, 'text': {'type': 'string'},
            'image_url': {'type': 'object', 'properties': {'url': {'type': 'string'}}}}}}, {'type': 'null'}]},
        'name': {'type': 'string'}, 'tool_call_id': {'type': 'string'},
        'tool_calls': {'type': 'array', 'items': {'$ref': '#/components/schemas/ToolCall'}}}}
    spec = {
        'openapi': '3.1.0',
        'info': {'title': 'Deiza API', 'version': '1.0.0', 'summary': 'OpenAI-compatible chat completions with the Deiza models.',
                 'description': 'Docs: https://deiza.org/docs/ (es) and https://deiza.org/docs/en/ (en). Markdown: https://deiza.org/llms-full.txt. '
                                'Keys: https://deiza.org/api-keys. Usage is charged to the Deiza plan of the key owner.',
                 'contact': {'name': 'DeizaLab', 'url': 'https://deiza.org'}},
        'servers': [{'url': 'https://deiza.org/api/v1'}, {'url': 'https://deiza.org/api/code', 'description': 'Previous base URL, same paths'}],
        'security': [{'bearer': []}],
        'paths': {
            '/chat/completions': {'post': {
                'operationId': 'createChatCompletion', 'summary': 'Create a chat completion (JSON or Server-Sent Events)',
                'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/ChatRequest'}}}},
                'responses': {'200': {'description': 'Completion. With stream=true: text/event-stream of chat.completion.chunk objects ending with data: [DONE]',
                                      'content': {'application/json': {'schema': {'$ref': '#/components/schemas/ChatCompletion'}},
                                                  'text/event-stream': {'schema': {'type': 'string'}}}}, **errors}}},
            '/models': {'get': {'operationId': 'listModels', 'summary': 'List models (public, no key needed)', 'security': [],
                                'responses': {'200': resp('Models', {'$ref': '#/components/schemas/ModelList'})}}},
            '/usage': {'get': {'operationId': 'getUsage', 'summary': 'Live usage of the 5-hour window and the week',
                               'responses': {'200': resp('Usage', {'$ref': '#/components/schemas/Usage'}), '401': errors['401']}}},
            '/search': {'post': {'operationId': 'search', 'summary': 'Web search with sources, or verified photos (40 per minute)',
                                 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/SearchRequest'}}}},
                                 'responses': {'200': resp('Results', {'$ref': '#/components/schemas/SearchResponse'}), '400': errors['400'], '401': errors['401'],
                                               '429': resp('Too many searches')}}},
        },
        'components': {
            'securitySchemes': {'bearer': {'type': 'http', 'scheme': 'bearer', 'description': 'API key dz_... (also accepted in the X-Api-Key header)'}},
            'schemas': {
                'Error': {'type': 'object', 'properties': {'error': {'type': 'object', 'properties': {
                    'message': {'type': 'string'}, 'type': {'type': 'string'}, 'code': {'type': 'string'}, 'param': {'type': ['string', 'null']}}}}},
                'Message': msg,
                'ToolCall': {'type': 'object', 'properties': {'id': {'type': 'string'}, 'type': {'const': 'function'},
                             'function': {'type': 'object', 'properties': {'name': {'type': 'string'}, 'arguments': {'type': 'string'}}}}},
                'ChatRequest': {'type': 'object', 'required': ['messages'], 'properties': {
                    'model': {'type': 'string', 'default': 'deiza-liquid-5.1', 'enum': ['deiza-liquid-5.1', 'deiza-solid-5', 'deiza-gas-4.5']},
                    'messages': {'type': 'array', 'items': {'$ref': '#/components/schemas/Message'}},
                    'stream': {'type': 'boolean', 'default': False},
                    'max_tokens': {'type': 'integer', 'default': 16384, 'maximum': 32768, 'minimum': 256},
                    'temperature': {'type': 'number', 'default': 0.2, 'minimum': 0, 'maximum': 1.5},
                    'reasoning_effort': {'type': 'string', 'enum': ['low', 'medium', 'high']},
                    'tools': {'type': 'array', 'maxItems': 64, 'items': {'type': 'object'}},
                    'tool_choice': {'oneOf': [{'type': 'string', 'enum': ['auto', 'none', 'required']}, {'type': 'object'}]},
                    'parallel_tool_calls': {'type': 'boolean'}}},
                'ChatCompletion': {'type': 'object', 'properties': {
                    'id': {'type': 'string'}, 'object': {'const': 'chat.completion'}, 'created': {'type': 'integer'}, 'model': {'type': 'string'},
                    'choices': {'type': 'array', 'items': {'type': 'object', 'properties': {'index': {'type': 'integer'},
                                'message': {'$ref': '#/components/schemas/Message'}, 'finish_reason': {'type': 'string'}}}},
                    'usage': {'type': 'object', 'properties': {'prompt_tokens': {'type': 'integer'}, 'completion_tokens': {'type': 'integer'}, 'total_tokens': {'type': 'integer'}}},
                    'deiza_usage_state': {'type': 'string', 'enum': ['ok', 'grace']}}},
                'Model': {'type': 'object', 'properties': {
                    'id': {'type': 'string'}, 'object': {'const': 'model'}, 'owned_by': {'type': 'string'}, 'name': {'type': 'string'},
                    'default': {'type': 'boolean'}, 'context_window': {'type': 'integer'}, 'max_output_tokens': {'type': 'integer'},
                    'vision': {'type': 'boolean'}, 'tools': {'type': 'boolean'}, 'reasoning_effort': {'type': 'boolean'},
                    'aliases': {'type': 'array', 'items': {'type': 'string'}}}},
                'ModelList': {'type': 'object', 'properties': {'data': {'type': 'array', 'items': {'$ref': '#/components/schemas/Model'}}}},
                'Usage': {'type': 'object', 'properties': {k: {'type': v} for k, v in {
                    'plan': 'string', 'tokens_used': 'integer', 'token_limit': 'integer', 'tokens_remaining': 'integer', 'pct': 'number',
                    'state': 'string', 'limit_scope': 'string', 'next_reset': 'string', 'reset_in_seconds': 'integer', 'exhausted': 'boolean',
                    'weekly_used': 'integer', 'weekly_limit': 'integer', 'weekly_pct': 'number', 'weekly_reset_at': 'string',
                    'weekly_reset_in_seconds': 'integer'}.items()}},
                'SearchRequest': {'type': 'object', 'required': ['query'], 'properties': {
                    'query': {'type': 'string', 'maxLength': 300}, 'type': {'type': 'string', 'enum': ['web', 'images'], 'default': 'images'},
                    'num': {'type': 'integer', 'minimum': 1, 'maximum': 12, 'default': 6}, 'language': {'type': 'string', 'default': 'es'}}},
                'SearchResponse': {'type': 'object', 'properties': {
                    'type': {'type': 'string'}, 'query': {'type': 'string'}, 'answer': {'type': 'string', 'description': 'Only for type=web'},
                    'results': {'type': 'array', 'items': {'type': 'object', 'properties': {
                        'url': {'type': 'string'}, 'title': {'type': 'string'}, 'source': {'type': 'string'}}}}}},
            },
        },
    }
    return spec


LLMS = '''# Deiza API

> OpenAI-compatible Chat Completions API for the Deiza models: Liquid 5.1 (default, 262k context), Solid 5 (deep reasoning, 1M context) and Gas 4.5 (fastest, text only). Base URL https://deiza.org/api/v1, auth `Authorization: Bearer dz_...`. Usage is charged to the key owner's Deiza plan (Friend or Signet; the Free plan has no API access).

Use any OpenAI SDK with `base_url="https://deiza.org/api/v1"` and a Deiza key (create it at https://deiza.org/api-keys). Model ids: `deiza-liquid-5.1`, `deiza-solid-5`, `deiza-gas-4.5`. Errors follow the OpenAI error format (`error.message`, `error.type`, `error.code`). Supported: streaming (SSE), vision (`image_url`, Liquid and Solid), function calling (`tools`, `tool_choice`), `reasoning_effort` (low/medium/high), `max_tokens` up to 32768.

## Docs

- [Full documentation in Markdown](https://deiza.org/llms-full.txt): everything in one file (English).
- [Documentation, English](https://deiza.org/docs/en/): HTML.
- [Documentación, español](https://deiza.org/docs/): HTML. Markdown: https://deiza.org/docs/api.es.md
- [OpenAPI 3.1 specification](https://deiza.org/openapi.json)
- [API self-description](https://deiza.org/api/v1): JSON.

## Endpoints

- `POST https://deiza.org/api/v1/chat/completions`: chat completion, JSON or Server-Sent Events.
- `GET https://deiza.org/api/v1/models`: models with context window and capabilities (public).
- `GET https://deiza.org/api/v1/usage`: live usage of the 5-hour window and the weekly period.
- `POST https://deiza.org/api/v1/search`: web search with sources (`type: web`) or verified photos (`type: images`).

## Optional

- [Plans and limits](https://deiza.org/plans): the API needs Friend (4M usage per 5-hour window, 35M per week) or Signet (8M, 85M per week); Free gets 403 plan_required.
- [Deiza Code CLI](https://deiza.org/download): terminal coding agent on top of this API.
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    srcs = {lang: build_page(lang) for lang in LANGS}
    os.makedirs(os.path.join(OUT, 'docs'), exist_ok=True)
    open(os.path.join(OUT, 'docs', 'api.md'), 'w', encoding='utf-8').write(srcs['en'])
    open(os.path.join(OUT, 'docs', 'api.es.md'), 'w', encoding='utf-8').write(srcs['es'])
    full = srcs['en'].replace('](/', '](https://deiza.org/')
    open(os.path.join(OUT, 'llms-full.txt'), 'w', encoding='utf-8').write(full)
    open(os.path.join(OUT, 'llms.txt'), 'w', encoding='utf-8').write(LLMS)
    open(os.path.join(OUT, 'openapi.json'), 'w', encoding='utf-8').write(json.dumps(openapi(), ensure_ascii=False, indent=2))
    for root, _, files in os.walk(OUT):
        for f in files:
            p = os.path.join(root, f)
            print(os.path.relpath(p, OUT), os.path.getsize(p))


if __name__ == '__main__':
    main()
