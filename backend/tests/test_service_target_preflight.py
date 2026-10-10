"""Read-only target preflight tests; synthetic wheels never prove installation."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "scripts/crm-calibration/service-target-preflight.py"


def wheel(directory, name="demo-1.0.0-py3-none-any.whl", metadata=None, *,
          wheel_metadata=None, info_dir="demo-1.0.0.dist-info", omit_wheel=False):
    target = directory / name
    with zipfile.ZipFile(target, "w") as archive:
        archive.writestr(info_dir + "/METADATA", metadata or "Name: demo\nVersion: 1.0.0\n")
        if not omit_wheel:
            tag = "-".join(name.removesuffix(".whl").split("-")[-3:])
            archive.writestr(info_dir + "/WHEEL", wheel_metadata or
                             f"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: {tag}\n")
    return target


@pytest.fixture
def inputs(tmp_path):
    # Resolve macOS's system /var alias; user-input symlinks are rejected.
    root = tmp_path.resolve()
    directory = root / "wheels"
    directory.mkdir()
    wheel(directory)
    recipe = json.loads((ROOT / "services/analytics-first-purchase/package.json").read_text())
    recipe.update(schema_version="shinemage-service-package/v1", dependencies={"demo": "1.0.0"},
                  source={}, files={}, release_ready=False)
    manifest = root / "service-manifest.json"
    manifest.write_text(json.dumps(recipe))
    return manifest, directory


def args_for(inputs):
    manifest, directory = inputs
    return ["--manifest", str(manifest),
            "--manifest-sha256", hashlib.sha256(manifest.read_bytes()).hexdigest(),
            "--wheelhouse", str(directory)]


def invoke(args, cwd, *, node=False):
    if node:
        binary = shutil.which("node")
        assert binary, "existing Node 24 is required"
        command = [binary, str(ROOT / "scripts/dsh.mjs"), "plugin", "service-preflight",
                   "--python", sys.executable, *args]
    else:
        command = [sys.executable, "-I", "-B", str(PROBE), *args]
    return subprocess.run(command, cwd=cwd, text=True, capture_output=True, timeout=5,
                          env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")})


def test_real_cli_is_read_only_and_never_promotes_acceptance(inputs):
    manifest, directory = inputs
    before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in (manifest, *directory.iterdir())}
    result = invoke(args_for(inputs), manifest.parent, node=True)
    assert result.returncode in {0, 2}
    report = json.loads(result.stdout)
    assert report["status"] in {"SERVICE_TARGET_PREFLIGHT_PASS", "SERVICE_TARGET_PREFLIGHT_BLOCKED"}
    assert report["manifest_sha256"] == hashlib.sha256(manifest.read_bytes()).hexdigest()
    assert report["wheels"]["demo"]["compatible"] is True
    assert report["release_ready"] is False and report["activation"] == "BLOCKED"
    assert set(report["acceptance"].values()) == {"NOT_RUN"}
    assert {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in before} == before
    assert sorted(p.name for p in manifest.parent.iterdir()) == ["service-manifest.json", "wheels"]
    assert result.stderr == ""


@pytest.mark.parametrize("tag,compatible", [
    ("py3-none-any", True),
    ("cp314-cp314-manylinux_2_17_x86_64", True),
    ("cp314-cp314-macosx_11_0_arm64", False),
    ("cp313-cp313-manylinux_2_17_x86_64", False),
    ("cp314-cp314-manylinux_2_17_aarch64", False),
])
def test_wsl_shape_tags_under_read_only_audit_guard(inputs, tag, compatible):
    manifest, directory = inputs
    next(directory.iterdir()).unlink()
    wheel(directory, f"demo-1.0.0-{tag}.whl")
    # Inject WSL facts ONLY inside this isolated test process, never a CLI option.
    code = """
import importlib.util, json, os, pathlib, sys
from unittest.mock import patch
from pip._vendor.packaging.tags import Tag
spec = importlib.util.spec_from_file_location('probe', sys.argv[1])
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
def guard(event, args):
    if event.startswith('socket.') or event in {'subprocess.Popen', 'os.system', 'os.mkdir', 'os.remove', 'os.rename', 'os.rmdir'}:
        raise RuntimeError('read-only boundary')
    if event == 'open' and args[2] & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND):
        raise RuntimeError('write boundary')
sys.addaudithook(guard)
with patch.object(probe.platform, 'system', return_value='Linux'), patch.object(probe.platform, 'release', return_value='6.6.87.2-microsoft-standard-WSL2'), patch('pip._vendor.packaging.tags.sys_tags', return_value=iter([Tag('py3', 'none', 'any'), Tag('cp314', 'cp314', 'manylinux_2_17_x86_64')])):
    print(json.dumps(probe.collect(pathlib.Path(sys.argv[2]), sys.argv[3], pathlib.Path(sys.argv[4]))))
"""
    result = subprocess.run([sys.executable, "-I", "-B", "-c", code, str(PROBE), str(manifest),
                             hashlib.sha256(manifest.read_bytes()).hexdigest(), str(directory)],
                            cwd=manifest.parent, text=True, capture_output=True, timeout=5, check=True)
    report = json.loads(result.stdout)
    assert report["wheels"]["demo"]["compatible"] is compatible
    assert (report["status"] == "SERVICE_TARGET_PREFLIGHT_PASS") is compatible
    assert report["release_ready"] is False and set(report["acceptance"].values()) == {"NOT_RUN"}


@pytest.mark.parametrize("change,expected", [
    ("missing", "SERVICE_TARGET_WHEEL_CLOSURE_INCOMPLETE"),
    ("extra", "SERVICE_TARGET_WHEEL_LOCK_MISMATCH"),
    ("duplicate", "SERVICE_TARGET_WHEEL_LOCK_MISMATCH"),
    ("metadata", "SERVICE_TARGET_WHEEL_METADATA_MISMATCH"),
    ("link", "SERVICE_TARGET_WHEELHOUSE_INVALID"),
    ("fifo", "SERVICE_TARGET_WHEELHOUSE_INVALID"),
    ("sdist", "SERVICE_TARGET_WHEELHOUSE_INVALID"),
])
def test_wheel_inputs_fail_closed(inputs, change, expected):
    manifest, directory = inputs
    original = next(directory.iterdir())
    if change == "missing":
        original.unlink()
    elif change == "extra":
        wheel(directory, "extra-1.0.0-py3-none-any.whl")
    elif change == "duplicate":
        wheel(directory, "demo-1.0.0-py2.py3-none-any.whl")
    elif change == "metadata":
        wheel(directory, metadata="Name: SYNTHETIC_PRIVATE_SENTINEL\nVersion: 1.0.0\n")
    elif change == "link":
        (directory / "alias.whl").symlink_to(original)
    elif change == "fifo":
        os.mkfifo(directory / "fifo.whl")
    else:
        (directory / "demo.tar.gz").write_bytes(b"not a wheel")
    result = invoke(args_for(inputs), manifest.parent)
    assert result.returncode == 2
    assert json.loads(result.stdout)["code"] == expected
    assert "SYNTHETIC_PRIVATE_SENTINEL" not in result.stdout + result.stderr


@pytest.mark.parametrize("change,expected", [
    ("digest", "SERVICE_TARGET_MANIFEST_DIGEST_MISMATCH"),
    ("fifo", "SERVICE_TARGET_FILE_INVALID"),
    ("link", "SERVICE_TARGET_LINK_REJECTED"),
    ("size", "SERVICE_TARGET_FILE_INVALID"),
    ("scope", "SERVICE_TARGET_MANIFEST_IDENTITY"),
    ("extra", "SERVICE_TARGET_MANIFEST_INVALID"),
    ("release", "SERVICE_TARGET_MANIFEST_IDENTITY"),
])
def test_manifest_inputs_fail_before_readiness(inputs, change, expected):
    manifest, _directory = inputs
    args = args_for(inputs)
    if change == "digest":
        args[3] = "0" * 64
    elif change == "fifo":
        manifest.unlink()
        os.mkfifo(manifest)
    elif change == "link":
        link = manifest.with_name("link.json")
        link.symlink_to(manifest)
        args[1] = str(link)
    elif change == "size":
        with manifest.open("wb") as stream:
            stream.truncate(256 * 1024 + 1)
    else:
        doc = json.loads(manifest.read_text())
        doc.update({"scope": "production"} if change == "scope"
                   else {"release_ready": True} if change == "release" else {"unknown": True})
        manifest.write_text(json.dumps(doc))
        args = args_for(inputs)
    result = invoke(args, manifest.parent)
    assert result.returncode == 2
    assert json.loads(result.stdout)["code"] == expected


def test_duplicate_and_relative_arguments_are_rejected(inputs):
    manifest, _directory = inputs
    args = args_for(inputs)
    repeated = invoke([*args, "--manifest", str(manifest)], manifest.parent)
    assert repeated.returncode == 2
    assert json.loads(repeated.stdout)["code"] == "SERVICE_TARGET_ARGUMENTS_INVALID"
    args[1] = manifest.name
    relative = invoke(args, manifest.parent)
    assert relative.returncode == 2
    assert json.loads(relative.stdout)["code"] == "SERVICE_TARGET_ABSOLUTE_PATH_REQUIRED"


@pytest.mark.parametrize("constraint,expected", [
    (">=3.14", True), ("<3.14", False), ("not-a-version", None),
])
def test_requires_python_is_checked_before_install(inputs, constraint, expected):
    manifest, directory = inputs
    wheel(directory, metadata=f"Name: demo\nVersion: 1.0.0\nRequires-Python: {constraint}\n")
    result = invoke(args_for(inputs), manifest.parent)
    report = json.loads(result.stdout)
    if expected is None:
        assert result.returncode == 2 and report["code"] == "SERVICE_TARGET_INPUT_INVALID"
    else:
        assert report["wheels"]["demo"]["python_compatible"] is expected
        check = next(row for row in report["checks"] if row["id"] == "wheel-python")
        assert (check["status"] == "PASS") is expected
        if not expected:
            assert result.returncode == 2 and check["code"] == "SERVICE_TARGET_WHEEL_PYTHON_MISMATCH"
    assert report["release_ready"] is False


@pytest.mark.parametrize("change", ["missing-wheel", "major-version", "renamed-platform", "wrong-dist-info"])
def test_invalid_install_metadata_is_not_ready(inputs, change):
    manifest, directory = inputs
    options = {
        "missing-wheel": {"omit_wheel": True},
        "major-version": {"wheel_metadata": "Wheel-Version: 2.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n"},
        "renamed-platform": {"wheel_metadata": "Wheel-Version: 1.0\nRoot-Is-Purelib: false\nTag: cp314-cp314-macosx_11_0_arm64\n"},
        "wrong-dist-info": {"info_dir": "other-1.0.0.dist-info"},
    }
    wheel(directory, **options[change])
    result = invoke(args_for(inputs), manifest.parent)
    report = json.loads(result.stdout)
    assert result.returncode == 2
    assert report["status"] == "SERVICE_TARGET_PREFLIGHT_INVALID"
    assert report["code"] == "SERVICE_TARGET_WHEEL_FORMAT_INVALID"


@pytest.mark.parametrize("requirement", ["missing-package>=1", "demo>=2"])
def test_unsatisfied_active_dependencies_are_not_ready(inputs, requirement):
    manifest, directory = inputs
    wheel(directory, metadata=f"Name: demo\nVersion: 1.0.0\nRequires-Dist: {requirement}\n")
    result = invoke(args_for(inputs), manifest.parent)
    report = json.loads(result.stdout)
    assert result.returncode == 2
    assert report["status"] == "SERVICE_TARGET_PREFLIGHT_INVALID"
    assert report["code"] == "SERVICE_TARGET_WHEEL_REQUIREMENT_MISMATCH"


@pytest.mark.parametrize("requirement,supported", [
    ('demo==1.0.0', True),
    ('missing-package>=1; python_version < "0.1"', True),
    ('missing-package>=1; extra == "optional"', True),
    ('demo @ https://invalid.example/package.whl', False),
    ('demo[optional]==1.0.0', False),
])
def test_active_markers_use_current_environment_without_resolving_extras_or_urls(inputs, requirement, supported):
    manifest, directory = inputs
    wheel(directory, metadata=f"Name: demo\nVersion: 1.0.0\nRequires-Dist: {requirement}\n")
    result = invoke(args_for(inputs), manifest.parent)
    report = json.loads(result.stdout)
    if supported:
        assert report["status"] != "SERVICE_TARGET_PREFLIGHT_INVALID"
        assert report["wheels"]["demo"]["compatible"] is True
    else:
        assert result.returncode == 2
        assert report["code"] == "SERVICE_TARGET_WHEEL_REQUIREMENT_UNSUPPORTED"
