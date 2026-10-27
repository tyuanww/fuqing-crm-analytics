import pytest
from pydantic import ValidationError

from backend.contracts.page_documents import PageDataReadRequest, page_documents_openapi
from backend.contracts.page_facts import PageFactReadRequest, PageFact


@pytest.mark.parametrize("extra", [
    {"cursor": "v1:0"}, {"limit": 1}, {"start": 0}, {"end": 1},
    {"facts": []}, {"selector": {}}, {"sql": "select 1"},
    {"data_ref": "data_1"},
])
def test_host_facts_rejects_partial_or_ambiguous_requests(extra):
    with pytest.raises(ValidationError):
        PageFactReadRequest.model_validate({
            "op": "data.read", "mode": "facts", "result_ref": "source_1", **extra,
        })


def test_host_facts_requires_a_reference():
    with pytest.raises(ValidationError):
        PageFactReadRequest.model_validate({"op": "data.read", "mode": "facts"})


def test_host_fact_values_keep_exact_integers_and_source_null():
    facts = [{"selector": {"kind": "purchase", "metric": metric}, "unit": "CNY fen", "value": value}
             for metric, value in (("GSV", "9007199254747995"), ("AOV", None))]
    assert [PageFact.model_validate(item).value for item in facts] == ["9007199254747995", None]


@pytest.mark.parametrize("value", [True, float("nan"), float("inf"), "N/A"])
def test_host_fact_values_reject_invalid_numbers(value):
    fact = {"selector": {"kind": "purchase", "metric": "GSV"}, "value": 0, "unit": "CNY fen"}
    assert PageFact.model_validate(fact).value == 0
    with pytest.raises(ValidationError) as error:
        PageFact.model_validate({**fact, "value": value})
    assert all(item['loc'][0] == 'value' for item in error.value.errors())


def test_host_fact_read_does_not_expand_iframe_protocol():
    with pytest.raises(ValidationError):
        PageDataReadRequest(protocol="free-page-bridge/v1", instance_id="instance_1", request_id="read_1",
                            nonce="nonce_1", seq=1, op="data.read", result_ref="source_1", mode="facts",
                            facts=[{"kind": "purchase", "metric": "GSV"}])
    schema = page_documents_openapi()
    assert schema["x-host-facts"]["max_response_bytes"] == 524288
    assert schema["x-bridge-budget"]["max_response_bytes"] == 65536
