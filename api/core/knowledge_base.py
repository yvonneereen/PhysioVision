"""Retrieval helpers for the clinician assistant's approved sources."""

import json
import math
import re
from functools import lru_cache
from pathlib import Path


KNOWLEDGE_BASE_PATH = Path(__file__).resolve().parents[1] / "knowledge_base" / "chunks.json"
TOKEN_RE = re.compile(r"[a-z0-9]+(?:[-'][a-z0-9]+)?")
STOP_WORDS = {
    "a", "about", "an", "and", "are", "as", "at", "be", "can", "do",
    "does", "for", "from", "how", "i", "in", "is", "it", "of", "on",
    "or", "should", "the", "this", "to", "what", "when", "which", "with",
}
TECHNICAL_TERMS = {
    "acl", "ankle", "assessment", "biomechanics", "clinical", "concussion",
    "contraindication", "diagnosis", "discharge", "elbow", "exercise", "gait",
    "hip", "indication", "injury", "intervention", "knee", "ligament",
    "mobility", "pain", "patella", "phase", "postoperative", "precaution",
    "progression", "protocol", "rehab", "rehabilitation", "repair", "return",
    "rom", "shoulder", "spine", "sprain", "strength", "surgery", "tendon",
    "therapy", "weightbearing",
}
GENERIC_RETRIEVAL_TERMS = {
    "assessment", "clinical", "criteria", "discharge", "exercise", "guidance",
    "intervention", "phase", "postoperative", "precaution", "progression",
    "protocol", "rehab", "rehabilitation", "return", "strength", "therapy",
}
CLINICAL_ANCHOR_TERMS = {
    "acl", "achilles", "ankle", "back", "biceps", "concussion", "cuff",
    "elbow", "foot", "hamstring", "hip", "knee", "labrum", "ligament",
    "lumbar", "meniscus", "patella", "patellar", "patellofemoral", "pcl",
    "quadriceps", "rotator", "shoulder", "spine", "tendon",
}


def _tokens(value):
    return [
        token for token in TOKEN_RE.findall(str(value).lower())
        if len(token) > 1 and token not in STOP_WORDS
    ]


@lru_cache(maxsize=1)
def load_chunks():
    if not KNOWLEDGE_BASE_PATH.exists():
        return []
    with KNOWLEDGE_BASE_PATH.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload.get("chunks", []) if isinstance(payload, dict) else []


def is_technical_question(message):
    """Identify clinical/rehabilitation questions without treating commands as QA."""
    text = str(message).strip().lower()
    tokens = set(_tokens(text))
    question_shape = (
        "?" in text
        or re.match(r"^(how|what|when|why|which|can|could|should|is|are|does)\b", text)
        or any(phrase in text for phrase in ("tell me about", "explain", "guidance on"))
    )
    return bool(question_shape and tokens.intersection(TECHNICAL_TERMS))


def retrieve_knowledge(message, *, limit=5):
    """Return relevant approved chunks using deterministic lexical ranking."""
    query = _tokens(message)
    if not query:
        return []
    chunks = load_chunks()
    if not chunks:
        return []
    document_frequency = {}
    prepared = []
    for chunk in chunks:
        tokens = _tokens(f"{chunk.get('title', '')} {chunk.get('text', '')}")
        token_set = set(tokens)
        prepared.append((chunk, tokens, token_set))
        for token in set(query).intersection(token_set):
            document_frequency[token] = document_frequency.get(token, 0) + 1
    scored = []
    total = len(chunks)
    specific_query_tokens = set(query).difference(GENERIC_RETRIEVAL_TERMS)
    query_anchors = set(query).intersection(CLINICAL_ANCHOR_TERMS)
    for chunk, tokens, token_set in prepared:
        title_tokens = set(_tokens(chunk.get("title", "")))
        if query_anchors and not query_anchors.intersection(title_tokens):
            continue
        if specific_query_tokens and not specific_query_tokens.intersection(token_set):
            continue
        score = 0.0
        for token in query:
            if token not in token_set:
                continue
            inverse_frequency = math.log((total + 1) / (document_frequency.get(token, 0) + 1)) + 1
            score += inverse_frequency * (3 if token in title_tokens else 1)
        normalized_query = " ".join(query)
        if normalized_query and normalized_query in " ".join(tokens):
            score += 5
        if score > 1:
            scored.append((score, chunk))
    scored.sort(key=lambda item: (-item[0], item[1].get("title", ""), item[1].get("page", 0)))
    return [chunk for _, chunk in scored[:limit]]


def knowledge_context(message):
    """Build bounded, source-labelled context for a technical clinician question."""
    if not is_technical_question(message):
        return "", []
    chunks = retrieve_knowledge(message)
    if not chunks:
        return (
            "No approved knowledge-base passage matched this technical question. "
            "State that the approved knowledge base does not currently support a "
            "grounded answer; do not fill the gap from general model knowledge.",
            [],
        )
    sources = []
    context_blocks = []
    seen_urls = set()
    for index, chunk in enumerate(chunks, start=1):
        title = chunk.get("title", "Approved source")
        url = chunk.get("url", "")
        page = chunk.get("page")
        context_blocks.append(
            f"[KB{index}] {title}"
            f"{f', page {page}' if page else ''}\nURL: {url}\n{chunk.get('text', '')}"
        )
        if url and url not in seen_urls:
            sources.append({"title": title, "url": url})
            seen_urls.add(url)
    instruction = (
        "Approved knowledge-base passages follow. For factual clinical or protocol "
        "claims, use only these passages. Cite claims inline as [KB1], [KB2], etc. "
        "End with a short 'Sources' list containing each used title and its full URL. "
        "Do not imply that a general protocol replaces examination, surgeon-specific "
        "instructions, or individual clinical judgement. If the passages are "
        "insufficient, say what is not covered.\n\n" + "\n\n".join(context_blocks)
    )
    return instruction, sources
