"""The board component catalogue is main-owned and never loaded from plugin source."""
from __future__ import annotations

import json
from pathlib import Path

from backend.contracts import board_spec

CONTRACTS = Path(board_spec.__file__).resolve().parent


def test_catalog_loads_from_the_main_owned_projection():
    catalog = json.loads((CONTRACTS / "component-catalog.json").read_text(encoding="utf-8"))
    assert board_spec.CATALOG == catalog
    assert board_spec.CATALOG["schema_version"] == "board-component-catalog/v1"


def test_board_spec_import_has_no_plugin_source_dependency():
    source = Path(board_spec.__file__).read_text(encoding="utf-8")
    assert "dsh-plugins/analytics-workbench" not in source
    assert 'with_name("component-catalog.json")' in source
    assert (CONTRACTS / "component-catalog.json").is_file()
