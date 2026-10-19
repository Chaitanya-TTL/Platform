import pytest
from codebeamer_extractor.config import CodebeamerConfig

def config(**overrides):
    values=dict(base_url="https://cb.example:8443",instance_key="primary",username="user",password="secret")
    values.update(overrides); return CodebeamerConfig(**values)
def test_normalizes_server_root_to_api_v3(): assert config().base_url=="https://cb.example:8443/cb/api/v3"
def test_preserves_api_v3_url(): assert config(base_url="https://cb.example:8443/cb/api/v3/").base_url.endswith("/cb/api/v3")
def test_rejects_empty_instance_key():
    with pytest.raises(ValueError): config(instance_key=" ")
def test_rejects_bad_page_size():
    with pytest.raises(ValueError): config(page_size=0)
def test_redacted_output_never_contains_password(): assert "secret" not in str(config().redacted)
def test_allow_and_deny_cannot_overlap():
    with pytest.raises(ValueError): config(project_allowlist=frozenset({9}),project_denylist=frozenset({9}))
