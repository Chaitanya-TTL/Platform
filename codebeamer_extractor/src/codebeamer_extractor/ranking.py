"""Deterministic lexical ranking with term-coverage precision guards."""
from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass

from .models import NormalizedRequirement

_DASHES = str.maketrans({"–": "-", "—": "-", "−": "-", "‐": "-"})
_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^a-z0-9.\-]+")
_IDENTIFIER_TOKEN = re.compile(r"^[a-z]+[- ]?\d+(?:[-.]\d+)*$")


def normalize_text(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", html.unescape(value or ""))
    text = text.translate(_DASHES).casefold()
    return _WS.sub(" ", _PUNCT.sub(" ", text)).strip()


def compact_identifier(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize_text(value))


def query_terms(query: str) -> tuple[str, ...]:
    return tuple(part for part in normalize_text(query).split() if part)


def _matched_terms(terms: tuple[str, ...], field: str) -> tuple[str, ...]:
    return tuple(term for term in terms if term in field)


def _all_terms(terms: tuple[str, ...], field: str) -> bool:
    return bool(terms) and len(_matched_terms(terms, field)) == len(terms)


def _strong_partial_match(terms: tuple[str, ...], field: str) -> bool:
    """Allow partial matching only when enough query meaning is preserved.

    Single-term queries keep normal lexical behavior. Multi-term queries must
    match at least two terms and at least two thirds of the distinct terms.
    Two-term queries therefore require both terms and fall through to the
    stronger all-term rule instead of producing noisy one-token matches.
    """
    if not terms:
        return False
    unique_terms = tuple(dict.fromkeys(terms))
    matched = _matched_terms(unique_terms, field)
    if len(unique_terms) == 1:
        return len(matched) == 1
    coverage = len(matched) / len(unique_terms)
    return len(matched) >= 2 and coverage >= (2 / 3) and len(matched) < len(unique_terms)


def _identifier_in_name(query: str, name: str) -> bool:
    normalized_query = normalize_text(query)
    if not _IDENTIFIER_TOKEN.fullmatch(normalized_query):
        return False
    wanted = compact_identifier(normalized_query)
    return any(compact_identifier(token) == wanted for token in name.split())


@dataclass(frozen=True)
class RankingOutcome:
    score: int
    classification: str
    matched_fields: tuple[str, ...]
    explanation: str


def rank_requirement(
    requirement: NormalizedRequirement,
    query: str,
) -> RankingOutcome | None:
    phrase = normalize_text(query)
    terms = query_terms(query)
    if not phrase:
        return None

    direct = {
        "externalKey": normalize_text(requirement.external_key),
        "name": normalize_text(requirement.name),
        "description": normalize_text(requirement.description),
        **{
            f"customFields.{key}": normalize_text(str(value))
            for key, value in requirement.custom_fields.items()
        },
    }
    context = {
        "parentName": normalize_text(requirement.parent_name),
        "childNames": normalize_text(" ".join(requirement.child_names)),
        "projectName": normalize_text(requirement.project_name),
        "trackerName": normalize_text(requirement.tracker_name),
        "categories": normalize_text(" ".join(requirement.categories)),
        "severities": normalize_text(" ".join(requirement.severities)),
        "priority": normalize_text(requirement.priority),
        "status": normalize_text(requirement.status),
    }

    scores: dict[str, int] = {}
    reasons: dict[str, str] = {}
    compact_query = compact_identifier(query)

    if phrase == direct["externalKey"] or (
        compact_query
        and compact_query == compact_identifier(requirement.external_key)
    ):
        scores["externalKey"] = 100
        reasons["externalKey"] = "Exact external identifier matched."

    name = direct["name"]
    if phrase == name:
        scores["name"] = 95
        reasons["name"] = "Exact requirement name matched."
    elif _identifier_in_name(query, name):
        scores["name"] = 90
        reasons["name"] = "Exact requirement identifier matched in the name."
    elif name.startswith(phrase):
        scores["name"] = 85
        reasons["name"] = "Requirement name begins with the query."
    elif phrase in name:
        scores["name"] = 75
        reasons["name"] = "Exact phrase matched the requirement name."
    elif _all_terms(terms, name):
        scores["name"] = 70
        reasons["name"] = "All query terms matched the requirement name."
    elif _strong_partial_match(terms, name):
        scores["name"] = 55
        reasons["name"] = "Most query terms matched the requirement name."

    description = direct["description"]
    if phrase in description:
        scores["description"] = 60
        reasons["description"] = "Exact phrase matched the requirement description."
    elif _all_terms(terms, description):
        scores["description"] = 50
        reasons["description"] = "All query terms matched the requirement description."
    elif _strong_partial_match(terms, description):
        scores["description"] = 35
        reasons["description"] = "Most query terms matched the requirement description."

    for field, value in direct.items():
        if not field.startswith("customFields."):
            continue
        if phrase in value:
            scores[field] = 45
            reasons[field] = "Exact phrase matched a custom field."
        elif _all_terms(terms, value):
            scores[field] = 40
            reasons[field] = "All query terms matched a custom field."

    for field in ("parentName", "childNames"):
        value = context[field]
        if phrase in value:
            scores[field] = 40
            reasons[field] = "Exact phrase matched requirement hierarchy context."
        elif _all_terms(terms, value):
            scores[field] = 35
            reasons[field] = "All query terms matched requirement hierarchy context."

    if phrase in context["projectName"]:
        scores["projectName"] = 30
        reasons["projectName"] = "Query matched the Codebeamer project context."
    elif _all_terms(terms, context["projectName"]):
        scores["projectName"] = 25
        reasons["projectName"] = "All query terms matched the Codebeamer project context."

    if phrase in context["trackerName"]:
        scores["trackerName"] = 20
        reasons["trackerName"] = "Query matched the Codebeamer tracker context."
    elif _all_terms(terms, context["trackerName"]):
        scores["trackerName"] = 18
        reasons["trackerName"] = "All query terms matched the Codebeamer tracker context."

    for field in ("categories", "severities"):
        if phrase in context[field]:
            scores[field] = 15
            reasons[field] = "Query matched requirement classification metadata."

    for field in ("priority", "status"):
        if phrase in context[field]:
            scores[field] = 10
            reasons[field] = "Query matched requirement workflow metadata."

    if not scores:
        return None

    matched = tuple(sorted(scores, key=lambda field: (-scores[field], field)))
    classification = (
        "direct"
        if any(
            field in {"externalKey", "name", "description"}
            or field.startswith("customFields.")
            for field in matched
        )
        else "contextual"
    )
    strongest = matched[0]
    return RankingOutcome(
        score=max(scores.values()),
        classification=classification,
        matched_fields=matched,
        explanation=reasons[strongest],
    )


def result_sort_key(result):
    return (
        -result.score,
        0 if result.classification == "direct" else 1,
        result.name.casefold(),
        result.project_name.casefold(),
        result.tracker_name.casefold(),
        result.item_id,
    )
