"""
Deiza Code chat for the /api/code/* routes: plain questions and answers about code,
without tools. Talks to any OpenAI-compatible chat/completions endpoint configured
with CODE_API_URL, CODE_API_KEY and CODE_MODEL_DEFAULT (see .env.example).
"""

import os
import json
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

CODE_API_URL = os.environ.get('CODE_API_URL', '')
CODE_API_KEY = os.environ.get('CODE_API_KEY', '')
CODE_MODEL = os.environ.get('CODE_MODEL_DEFAULT', '') or os.environ.get('CODE_MODEL_LIQUID', '')

SYSTEM_PROMPT = """You are Deiza Code, the coding agent of Deiza.

**Identity:**
- You are Deiza Code, built by DeizaLab.
- You are extremely efficient, fast, and useful.
- Never mention or speculate about the underlying model, provider or infrastructure.
- If asked what you are: "I am Deiza Code, the coding agent of Deiza."

**Core capabilities:**
- Expert-level programming in any language: Python, JavaScript, TypeScript, Rust, Go, C++, Java, and more
- Code generation, debugging, optimization, refactoring, and explanation
- System design, architecture, algorithms, and data structures
- Code review with actionable suggestions
- Terminal commands, shell scripting, devops, and infrastructure
- Answer precisely and concisely — don't over-explain unless asked

**Response style:**
- Be concise and direct. Prioritize code over prose.
- Use **bold** for key terms, `inline code` for functions/variables, and code blocks with language tags.
- For code: complete, working, production-quality code. No placeholders, no "rest of the code here".
- For explanations: brief and to the point. Show code, then explain.
- NEVER use emojis. Zero emojis always.
- NEVER say "as an AI model" or "as a language model" — you are Deiza Code, a coding agent.

**Current date and time:** {current_dt}"""


class CodeAIService:
    def __init__(self):
        if not (CODE_API_URL and CODE_API_KEY and CODE_MODEL):
            raise ValueError('CODE_API_URL, CODE_API_KEY and CODE_MODEL_DEFAULT must be set')
        self.MODEL_ID = CODE_MODEL

    def _get_system_prompt(self) -> str:
        current_dt = datetime.now().strftime('%A, %d %B %Y, %H:%M')
        return SYSTEM_PROMPT.format(current_dt=current_dt)

    def _build_messages(self, message: str, history=None) -> list:
        system_parts = [self._get_system_prompt()]
        messages = []
        for msg in history or []:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            if isinstance(content, list):
                content = '\n'.join(p.get('text', '') for p in content if isinstance(p, dict))
            if role == 'system':
                system_parts.append(content)
            elif content:
                messages.append({'role': 'assistant' if role in ('assistant', 'model', 'ai') else 'user',
                                 'content': content})
        messages.append({'role': 'user', 'content': message})
        return [{'role': 'system', 'content': '\n\n---\n\n'.join(system_parts)}] + messages

    def _headers(self) -> dict:
        return {'Authorization': f'Bearer {CODE_API_KEY}', 'Content-Type': 'application/json'}

    def _body(self, message, history, stream):
        return {'model': self.MODEL_ID, 'messages': self._build_messages(message, history),
                'max_tokens': 8192, 'temperature': 0.7, 'stream': stream}

    def stream_chat(self, message: str, history=None):
        try:
            resp = requests.post(CODE_API_URL, headers=self._headers(),
                                 json=self._body(message, history, True), stream=True, timeout=60)
            if resp.status_code != 200:
                logger.error(f'Code stream error: HTTP {resp.status_code} — {resp.text[:500]}')
                raise Exception(f'Deiza Code error: HTTP {resp.status_code}')
            resp.encoding = 'utf-8'
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith('data:'):
                    continue
                data = line[5:].strip()
                if data == '[DONE]':
                    break
                try:
                    delta = json.loads(data)['choices'][0].get('delta') or {}
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if delta.get('content'):
                    yield delta['content']
        except requests.RequestException as e:
            logger.error(f'Code request error: {e}', exc_info=True)
            raise Exception(f'Deiza Code error: connection failed — {str(e)[:200]}')

    def send_chat(self, message: str, history=None) -> dict:
        try:
            resp = requests.post(CODE_API_URL, headers=self._headers(),
                                 json=self._body(message, history, False), timeout=120)
            if resp.status_code != 200:
                logger.error(f'Code send error: HTTP {resp.status_code} — {resp.text[:500]}')
                raise Exception(f'Deiza Code error: HTTP {resp.status_code}')
            result = resp.json()
            choice = (result.get('choices') or [{}])[0]
            usage = result.get('usage') or {}
            return {
                'content': (choice.get('message') or {}).get('content') or '',
                'tokens_in': usage.get('prompt_tokens', 0),
                'tokens_out': usage.get('completion_tokens', 0),
                'tokens_total': usage.get('total_tokens', 0),
                'model': self.MODEL_ID,
                'stop_reason': choice.get('finish_reason', ''),
            }
        except requests.RequestException as e:
            logger.error(f'Code request error: {e}', exc_info=True)
            raise Exception(f'Deiza Code error: connection failed — {str(e)[:200]}')
