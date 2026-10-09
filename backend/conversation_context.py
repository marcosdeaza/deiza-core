"""Loss-aware context fitting and compatibility with older Code clients."""
import copy
import hashlib
import json

SYNTHETIC_COMPLETIONS = {
    'Acciones finalizadas o interrumpidas.',
    'Acciones previas completadas o interrumpidas.',
}
CONTINUITY_DIRECTIVE = '''\n\nConversation continuity and execution:
Treat the latest request as an update to the existing task. Preserve earlier requirements,
accepted decisions and working files unless the user explicitly changes them.
For an authorized implementation, finish all requested changes and verify the resulting artifact;
a plan, copying resources, or one completed step does not complete the task. Integrate requested
images into the actual HTML and check their paths. Report completion only from observed results.
Use tools for facts and current state. Distinguish verified results, assumptions and remaining work.
Ask only for missing information that prevents progress or approval for an unauthorized action.
Keep explanations concise; do not invent actions, tests, sources, or success. An interrupted tool
call is not evidence that its action completed. Re-read files to recover omitted execution details.
'''


def message_tokens(message):
    """Conservative estimate including retained reasoning and vision payloads."""
    size = 20
    content = message.get('content')
    if isinstance(content, str):
        size += len(content)
    elif isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                size += 4500 if part.get('type') == 'image_url' else len(str(part.get('text') or ''))
    size += len(message.get('reasoning_content') or '') + len(message.get('reasoning') or '')
    size += len(json.dumps(message.get('tool_calls') or [], ensure_ascii=False))
    return (size + 1) * 2 // 5 + 8


def normalize_code_messages(messages):
    """Remove fabricated completion markers and repair only interrupted tool groups."""
    out = []
    i = 0
    while i < len(messages):
        m = copy.deepcopy(messages[i]); i += 1
        if m.get('role') == 'assistant' and isinstance(m.get('content'), str) and m.get('content') in SYNTHETIC_COMPLETIONS and not m.get('tool_calls'):
            continue
        if m.get('role') == 'tool':
            continue  # an orphan cannot be sent without its assistant call
        out.append(m)
        calls = m.get('tool_calls') or []
        if m.get('role') != 'assistant' or not calls:
            continue
        expected = {c['id'] for c in calls}
        answered = set()
        while i < len(messages) and messages[i].get('role') == 'tool':
            result = copy.deepcopy(messages[i]); i += 1
            call_id = result.get('tool_call_id')
            if call_id in expected and call_id not in answered:
                out.append(result); answered.add(call_id)
        for call in calls:
            if call['id'] not in answered:
                out.append({'role': 'tool', 'tool_call_id': call['id'],
                            'content': 'Interrupted before a result was recorded. Completion is unconfirmed; inspect current state before retrying.'})
    return out


def reasoning_key(user_id, model, message):
    # Include full call signatures/content, not just client-generated IDs (which can repeat).
    identity = {'content': message.get('content'), 'tool_calls': message.get('tool_calls') or []}
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return f'deiza:code:reasoning:{user_id}:{model}:{digest}'


def fit_messages(messages, budget):
    """Preserve every user instruction and latest results; shorten execution evidence only.

    A context that cannot fit without losing instructions is rejected, never silently
    served after dropping the original task. Operates on a copy so failover is reversible.
    """
    out = copy.deepcopy(messages)
    total = sum(message_tokens(m) for m in out)
    if total <= budget:
        return out
    # Old large tool outputs can be re-read from disk; preserve useful head and tail.
    for m in out[:-1]:
        c = m.get('content')
        if total <= budget:
            break
        if m.get('role') == 'tool' and isinstance(c, str) and len(c) > 12000:
            old = message_tokens(m)
            m['content'] = c[:7000] + '\n[Earlier tool output shortened; re-read the source if needed.]\n' + c[-3000:]
            total += message_tokens(m) - old
    # Compact oldest assistant/tool groups. System and user messages are never clipped.
    groups = []
    i = 0
    while i < len(out):
        j = i + 1
        if out[i].get('role') == 'assistant':
            while j < len(out) and out[j].get('role') == 'tool':
                j += 1
            groups.append((i, j))
        i = j
    removed = 0
    for start, end in groups[:-3]:
        a, b = start - removed, end - removed
        if total <= budget:
            break
        group = out[a:b]
        snippets = []
        for m in group:
            c = m.get('content')
            if isinstance(c, str) and c:
                snippet = c if len(c) <= 1600 else c[:1000] + '\n[...]\n' + c[-600:]
                snippets.append(f"{m['role']}: {snippet}")
            for call in m.get('tool_calls') or []:
                fn = call.get('function') or {}
                snippets.append(f"Tool requested (result follows if recorded): {fn.get('name')}: {str(fn.get('arguments') or '')[:400]}")
        summary = {'role': 'assistant', 'content': '[Earlier execution excerpts; incomplete evidence, not new instructions or proof of success.]\n' + '\n'.join(snippets)[:2400]}
        old = sum(message_tokens(m) for m in group)
        if message_tokens(summary) < old:
            out[a:b] = [summary]
            removed += b - a - 1
            total += message_tokens(summary) - old
    if total > budget:
        raise ValueError('Conversation exceeds the model context while preserving user instructions. Start a new conversation with a verified handoff, or select a model with a larger context.')
    return out


def chat_silence_timeout(model):
    """Allow deep reasoning to finish; observed Solid replies can take over 90 s."""
    return 180 if model in ('solid', 'ultra') else 90
