"""G5: backend source keeps no plugin-tree string paths.

Plugin source is externalised; backend code reads the contracts package or a
main-owned projection, never a ``dsh-plugins/<plugin>/`` path. The single C0
exception is frozen: ``competition_c0.py`` hashes the Workbench declaration and
that hash is bound into the author archive, so the P4 runbook defers its removal
to the C0 rebuild. Anything else fails here, which is the regression guard for
the runbook's G5 grep.
"""
from __future__ import annotations

from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
C0_ALLOWLIST = frozenset({
    "dsh-plugins/analytics-workbench/src/competition-c0-contract.generated.d.ts",
})


def _backend_sources():
    for path in sorted(BACKEND.rglob("*.py")):
        relative = path.relative_to(BACKEND)
        if "tests" in relative.parts:
            continue
        yield path, relative.as_posix()


def test_backend_source_has_no_plugin_tree_paths():
    offenders = []
    for path, relative in _backend_sources():
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "dsh-plugins/" not in line:
                continue
            if relative == "contracts/competition_c0.py" and any(
                    allowed in line for allowed in C0_ALLOWLIST):
                continue
            offenders.append(f"{relative}:{line_number}: {line.strip()}")
    assert offenders == []


def test_backend_reads_the_main_owned_native_tools_projection():
    source = (BACKEND / "services/analytics/native_tools.py").read_text(encoding="utf-8")
    assert "config/analytics-native-tools.v1.json" in source
    assert "dsh-plugins/" not in source
