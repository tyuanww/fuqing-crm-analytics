"""Cache keys include口径/data/mapping/filter/permission versions."""

from __future__ import annotations

from backend.services.crm_readonly import build_synthetic_grain_source
from backend.services.crm_readonly.cache import cache_key
from backend.tests.test_crm_readonly import make_adapter, private_dir, request_for, three_line_sample


def test_cache_hit_and_version_miss(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    adapter = make_adapter(tmp_path, source)
    first = adapter.materialize(request_for(source.source_id))
    second = adapter.materialize(request_for(source.source_id))
    assert first.cache_hit is False
    assert second.cache_hit is True
    assert second.query_ref == first.query_ref
    third = adapter.materialize(request_for(source.source_id, amount_already_net=True))
    assert third.cache_hit is False
    other = adapter.materialize(request_for(source.source_id, channel_ids=["直播"]))
    assert other.cache_hit is False


def test_permission_in_cache_key():
    filters = {
        "period_start": "2026-09-01",
        "period_end_exclusive": "2026-09-20",
        "refund_view": "ORDER_COHORT_AS_OF",
        "refund_as_of": "2026-09-19",
        "data_through": "2026-09-19",
        "timezone": "Asia/Shanghai",
        "channel_ids": None,
        "product_ids": None,
        "identity_scope": "STOREWIDE",
        "observation_days": None,
        "amount_already_net": False,
    }
    base = dict(
        source_id="s",
        data_version="d1",
        schema_version="g1",
        mapping_version="crm-mapping/v1-declared",
        metric_version="crm-metrics/v1",
        permission_version="crm-permission/v1",
        actor_scope="a",
        resolved_filters=filters,
        refund_as_of="2026-09-19",
    )
    key_a = cache_key(**base)
    key_b = cache_key(**{**base, "actor_scope": "b"})
    key_c = cache_key(**{**base, "metric_version": "crm-metrics/v2"})
    key_d = cache_key(**{**base, "mapping_version": "crm-mapping/v2"})
    key_e = cache_key(**{**base, "data_version": "d2"})
    assert len({key_a, key_b, key_c, key_d, key_e}) == 5


def test_cache_file_is_not_rfm_path(tmp_path):
    source = build_synthetic_grain_source(private_dir(tmp_path, "src"), source_id="crm-synthetic-grain-v1", lines=three_line_sample())
    adapter = make_adapter(tmp_path, source)
    adapter.materialize(request_for(source.source_id))
    cache_files = list(adapter.cache.directory.glob("*.duckdb"))
    assert cache_files
    assert cache_files[0].name == "crm-readonly-cache.duckdb"
    parts = cache_files[0].resolve().parts
    assert "processed" not in parts
    assert cache_files[0].name != "rfm_query_cache"
    assert not any(part == "cache" and parts[i - 1] == "data" for i, part in enumerate(parts) if i)
