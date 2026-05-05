"""HR1 bill knowledge store — load pre-chunked sections and search."""
import json
import re
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
CHUNKS_PATH = DATA_DIR / "hr1_chunks.json"

_chunks: list[dict] = []

_STOP_WORDS = {
    "the", "and", "for", "that", "this", "with", "from", "are", "was", "were",
    "been", "being", "have", "has", "had", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "not", "but", "nor",
    "yet", "also", "just", "about", "how", "what", "when", "where", "which",
    "who", "whom", "why", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "than", "too", "very", "any", "its",
    "into", "over", "under", "after", "before", "between", "through",
    "during", "above", "below", "out", "off", "then", "once", "here",
    "there", "these", "those", "them", "they", "their", "our", "your",
    "his", "her", "him", "she", "say", "says", "said", "tell", "change",
    "changes", "does", "make", "made", "affect", "impact", "new",
}

# Terms that get extra weight when scoring chunks
_BOOST_TERMS = {
    "snap": 5, "food": 3, "nutrition": 4, "supplemental": 4,
    "thrifty": 4, "allotment": 4, "abawd": 5, "able-bodied": 5,
    "utility": 4, "allowance": 4, "allowances": 4,
    "medicaid": 4, "eligibility": 3, "redetermination": 4,
    "work": 2, "requirement": 3, "requirements": 3, "waiver": 3,
    "benefit": 3, "deduction": 3, "income": 3, "household": 3,
    "categorical": 4, "immigration": 3, "defense": 3, "tax": 3,
    "energy": 3, "assistance": 2, "matching": 3,
}


def _load_chunks():
    global _chunks
    if not CHUNKS_PATH.exists():
        logger.error(f"HR1 chunks file not found at {CHUNKS_PATH}")
        return
    with open(CHUNKS_PATH, "r") as f:
        _chunks = json.load(f)
    logger.info(f"HR1: loaded {len(_chunks)} sections from {CHUNKS_PATH.name}")


def search_hr1(query: str, top_n: int = 5) -> list[dict]:
    """Return top_n chunks whose text best matches the query keywords."""
    if not _chunks:
        return []

    # Extract meaningful tokens, skip short words and stop words
    raw_tokens = set(re.findall(r'\b[\w-]{3,}\b', query.lower()))
    tokens = raw_tokens - _STOP_WORDS

    if not tokens:
        return []

    scored = []
    for chunk in _chunks:
        haystack = chunk["text"].lower()
        score = 0
        for t in tokens:
            if t in haystack:
                # Count occurrences for frequency-based scoring
                count = haystack.count(t)
                weight = _BOOST_TERMS.get(t, 1)
                score += weight * min(count, 5)  # cap at 5 occurrences
        if score > 0:
            # Bonus for title matches (section header relevance)
            title_lower = chunk["title"].lower()
            for t in tokens:
                if t in title_lower:
                    score += _BOOST_TERMS.get(t, 1) * 3
            scored.append((score, chunk))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:top_n]]


try:
    _load_chunks()
except Exception as e:
    logger.error(f"HR1 store init failed: {e}")
