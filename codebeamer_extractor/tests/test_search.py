import pytest

from codebeamer_extractor.models import (
    CatalogSnapshot,
    NormalizedRequirement,
    RequirementSearchRequest,
)
from codebeamer_extractor.search import CodebeamerSearchService, EmptySearchQueryError
from codebeamer_extractor.storage import FileCatalogRepository


def item(item_id, name, description="", **overrides):
    values = dict(
        source_instance="primary",
        canonical_id=f"codebeamer:primary:item:{item_id}",
        project_id=9,
        project_name="Steering Requirements",
        tracker_id=9734,
        tracker_name="CRS",
        tracker_type="Requirement",
        item_id=item_id,
        external_key=f"CRS-{item_id}",
        name=name,
        description=description,
        synchronized_at="now",
    )
    values.update(overrides)
    return NormalizedRequirement(**values)


def service(tmp_path):
    repository = FileCatalogRepository(tmp_path)
    repository.save_catalog(
        CatalogSnapshot(
            instance_key="primary",
            revision="r1",
            synchronized_at="now",
            status="complete",
            requirements=[
                item(1, "SR-001 Steering Material", "Manufactured using Mild Steel"),
                item(2, "SR-006 Orientation Logic", "India uses Right Hand Drive"),
                item(3, "SR-003 Steering Weight", "Maximum weight is 2.5 kg"),
                item(4, "Revision History", "Version 2.5 introduced a record"),
                item(5, "BSD right warning", "Warning appears on the right side"),
                item(6, "Generic", project_name="Bike Platform", stale=True),
            ],
        )
    )
    return CodebeamerSearchService(repository)


def test_searches_description_and_returns_catalog_metadata(tmp_path):
    result = service(tmp_path).search(RequirementSearchRequest(query="mild steel"))
    assert result.catalog_revision == "r1"
    assert [match.item_id for match in result.matches] == [1]


def test_numeric_query_rejects_single_token_noise(tmp_path):
    result = service(tmp_path).search(RequirementSearchRequest(query="2.5 kg"))
    assert [match.item_id for match in result.matches] == [3]


def test_three_term_query_rejects_single_token_noise(tmp_path):
    result = service(tmp_path).search(RequirementSearchRequest(query="right hand drive"))
    assert result.matches[0].item_id == 2
    assert 5 not in [match.item_id for match in result.matches]


def test_identifier_in_name_is_ranked_strongly(tmp_path):
    result = service(tmp_path).search(RequirementSearchRequest(query="SR-001"))
    assert result.matches[0].item_id == 1
    assert result.matches[0].score == 90


def test_filters_stale_and_contextual_results(tmp_path):
    search = service(tmp_path)
    assert search.search(RequirementSearchRequest(query="bike")).matches
    assert not search.search(
        RequirementSearchRequest(query="bike", include_stale=False)
    ).matches
    assert not search.search(
        RequirementSearchRequest(query="bike", include_contextual=False)
    ).matches


def test_filters_project_and_tracker_and_limits_results(tmp_path):
    result = service(tmp_path).search(
        RequirementSearchRequest(
            query="steering",
            project_id=9,
            tracker_id=9734,
            limit=1,
        )
    )
    assert len(result.matches) == 1


def test_rejects_empty_query(tmp_path):
    with pytest.raises(EmptySearchQueryError):
        service(tmp_path).search(RequirementSearchRequest(query="   "))
