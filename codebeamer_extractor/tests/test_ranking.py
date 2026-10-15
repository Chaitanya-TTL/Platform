from codebeamer_extractor.models import NormalizedRequirement
from codebeamer_extractor.ranking import normalize_text, rank_requirement


def requirement(**overrides):
    values = dict(
        source_instance="primary",
        canonical_id="codebeamer:primary:item:1",
        project_id=9,
        project_name="Steering Requirements",
        tracker_id=9734,
        tracker_name="Customer Requirement Specifications",
        tracker_type="Requirement",
        item_id=1,
        external_key="CRS-1190",
        name="SR-001 Steering Material",
        description="The component shall use Mild Steel and weigh 2.5 kg.",
        parent_name="Steering System Requirements",
        synchronized_at="now",
    )
    values.update(overrides)
    return NormalizedRequirement(**values)


def test_exact_external_identifier_receives_highest_score():
    item = requirement(external_key="SR-001")
    assert rank_requirement(item, "SR 001").score == 100


def test_identifier_in_requirement_name_receives_strong_score():
    result = rank_requirement(requirement(), "SR-001")
    assert result.score == 90
    assert result.explanation == "Exact requirement identifier matched in the name."


def test_description_phrase_is_direct():
    result = rank_requirement(requirement(), "mild steel")
    assert result.score == 60
    assert result.classification == "direct"
    assert "description" in result.matched_fields


def test_context_only_match_is_contextual():
    result = rank_requirement(
        requirement(name="Material", description="Steel"),
        "steering requirements",
    )
    assert result.classification == "contextual"


def test_numeric_units_and_hyphens_are_preserved():
    assert normalize_text("2.5 kg") == "2.5 kg"
    assert rank_requirement(requirement(), "2.5 kg") is not None
    assert normalize_text("SR–001") == "sr-001"


def test_two_term_query_does_not_match_one_weak_term():
    item = requirement(
        name="Revision History",
        description="Version 2.5 introduced a new record.",
        project_name="Generic",
        parent_name=None,
    )
    assert rank_requirement(item, "2.5 kg") is None


def test_three_term_query_does_not_match_one_weak_term():
    item = requirement(
        name="BSD right warning requirements",
        description="Warning appears on the right side.",
        project_name="Generic",
        parent_name=None,
    )
    assert rank_requirement(item, "right hand drive") is None


def test_three_term_query_allows_meaningful_two_term_coverage():
    item = requirement(
        name="Right hand orientation",
        description="Orientation rule.",
        project_name="Generic",
        parent_name=None,
    )
    result = rank_requirement(item, "right hand drive")
    assert result is not None
    assert result.score == 55
