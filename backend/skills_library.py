"""
Deiza Skills — user-imported Markdown instruction packs (SKILL.md-style
files). Each skill is a title + description + markdown body; when enabled it
is injected into the system prompt of every chat (see app.py
`_build_skills_context`). Nothing is built in: the library is the user's own.
"""

SKILLS_HEADER_ES = (
    '**Skills activas (instrucciones importadas por el usuario):** cuando la tarea encaje con la '
    'descripcion o el contenido de una skill, aplica sus instrucciones con naturalidad, sin anunciarlo '
    'ni nombrar la skill. Si varias encajan, combinalas. Si ninguna encaja, ignoralas.'
)
SKILLS_HEADER_EN = (
    '**Active skills (user-imported instructions):** when a task matches a skill description or '
    'content, follow its instructions naturally without announcing it or naming the skill. Combine '
    'them if several match. Ignore them otherwise.'
)

MAX_ACTIVE_SKILLS = 10
MAX_SKILL_CHARS = 8000
MAX_SKILLS = 30


def build_skills_context(custom_skills: list, language: str = 'es') -> str:
    """Render the enabled skills as a system-prompt block (or '' when none)."""
    active = [sk for sk in (custom_skills or [])
              if isinstance(sk, dict) and sk.get('enabled', True) and sk.get('name') and sk.get('instructions')]
    active = active[:MAX_ACTIVE_SKILLS]
    if not active:
        return ''
    parts = [SKILLS_HEADER_ES if language == 'es' else SKILLS_HEADER_EN]
    for sk in active:
        desc = (sk.get('description') or '').strip()
        body = (sk.get('instructions') or '').strip()[:MAX_SKILL_CHARS]
        head = f"### Skill: {sk['name'].strip()}"
        if desc:
            head += f"\n_{desc}_"
        parts.append(f"{head}\n{body}")
    return '\n\n'.join(parts)
