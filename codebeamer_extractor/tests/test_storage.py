import json,pytest
from codebeamer_extractor.models import CatalogSnapshot
from codebeamer_extractor.storage import FileCatalogRepository,CatalogIntegrityError
def test_atomic_round_trip_and_tamper_detection(tmp_path):
    repo=FileCatalogRepository(tmp_path);snapshot=CatalogSnapshot(instance_key="primary",revision="r1",synchronized_at="now",status="complete");repo.save_catalog(snapshot);assert repo.load_catalog().revision=="r1";payload=json.loads(repo.catalog_file.read_text());payload["revision"]="tampered";repo.catalog_file.write_text(json.dumps(payload));
    with pytest.raises(CatalogIntegrityError):repo.load_catalog()
