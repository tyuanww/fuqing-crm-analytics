#!/usr/bin/env python3
"""Read-only WSL2 readiness for a previously verified first-purchase manifest.

Does not install/import a service, create state, use the network or authorize
activation. The caller supplies the digest from its artifact verification.
"""
from __future__ import annotations

import argparse
from email.parser import BytesParser
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import stat
import sys
import zipfile

sys.dont_write_bytecode = True
HEX = re.compile(r"[0-9a-f]{64}")


class PreflightError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise PreflightError(code)


def read_regular(path, limit):
    require(path.is_absolute(), "SERVICE_TARGET_ABSOLUTE_PATH_REQUIRED")
    require(not any(p.is_symlink() for p in (path, *path.parents)),
            "SERVICE_TARGET_LINK_REJECTED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit,
                "SERVICE_TARGET_FILE_INVALID")
        content = stream.read(info.st_size + 1)
        require(len(content) == info.st_size, "SERVICE_TARGET_FILE_CHANGED")
        return content


def manifest_input(path, expected):
    require(isinstance(expected, str) and HEX.fullmatch(expected),
            "SERVICE_TARGET_MANIFEST_DIGEST_INVALID")
    raw = read_regular(path, 256 * 1024)
    require(hashlib.sha256(raw).hexdigest() == expected,
            "SERVICE_TARGET_MANIFEST_DIGEST_MISMATCH")
    manifest = json.loads(raw)
    keys = {"schema_version", "domain", "name", "version", "api_version", "owner",
            "scope", "python", "dependencies", "files", "source", "release_ready"}
    if isinstance(manifest, dict) and "service_source" in manifest:
        keys.add("service_source")
    require(isinstance(manifest, dict) and set(manifest) == keys,
            "SERVICE_TARGET_MANIFEST_INVALID")
    require(all(manifest.get(k) == v for k, v in {
        "schema_version": "shinemage-service-package/v1", "domain": "first-purchase",
        "name": "shinemage-analytics-first-purchase-service", "owner": "analysis-service",
        "scope": "synthetic_only", "api_version": "1.0.0", "python": "3.14",
    }.items()) and manifest["release_ready"] is False,
        "SERVICE_TARGET_MANIFEST_IDENTITY")
    require(isinstance(manifest["version"], str)
            and re.fullmatch(r"\d+\.\d+\.\d+(?:rc\d+)?", manifest["version"]),
            "SERVICE_TARGET_MANIFEST_VERSION")
    deps = manifest["dependencies"]
    require(isinstance(deps, dict) and 1 <= len(deps) <= 100
            and all(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", key)
                    and isinstance(pin, str) and re.fullmatch(r"\d+(?:\.\d+)+(?:[a-z]+\d+)?", pin)
                    for key, pin in deps.items()), "SERVICE_TARGET_DEPENDENCIES_INVALID")
    return manifest


def wheel_inventory(directory, dependencies, supported):
    # pip is already required by the offline installer. Its vendored packaging
    # computes real interpreter/ABI/platform tags; do not guess from filenames.
    from pip._vendor.packaging.utils import canonicalize_name, parse_wheel_filename
    from pip._vendor.packaging.specifiers import SpecifierSet
    from pip._vendor.packaging.tags import parse_tag
    from pip._vendor.packaging.requirements import Requirement

    require(directory.is_absolute() and directory.is_dir()
            and not any(p.is_symlink() for p in (directory, *directory.parents)),
            "SERVICE_TARGET_WHEELHOUSE_INVALID")
    entries = []
    with os.scandir(directory) as listing:
        for entry in listing:
            require(len(entries) < 100 and entry.is_file(follow_symlinks=False)
                    and re.fullmatch(r"[A-Za-z0-9_.+-]+\.whl", entry.name),
                    "SERVICE_TARGET_WHEELHOUSE_INVALID")
            entries.append(Path(entry.path))
    records, total = {}, 0
    for path in sorted(entries):
        name, version, _build, tags = parse_wheel_filename(path.name)
        require(name in dependencies and name not in records
                and str(version) == dependencies[name], "SERVICE_TARGET_WHEEL_LOCK_MISMATCH")
        raw = read_regular(path, 64 * 1024 * 1024)
        total += len(raw)
        require(total <= 256 * 1024 * 1024, "SERVICE_TARGET_WHEELHOUSE_SIZE")
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = archive.namelist()
            require(len(names) <= 10000 and len(names) == len(set(names)),
                    "SERVICE_TARGET_WHEEL_FORMAT_INVALID")
            info_dirs = {entry.split("/", 1)[0] for entry in names
                         if entry.split("/", 1)[0].endswith(".dist-info")}
            require(len(info_dirs) == 1, "SERVICE_TARGET_WHEEL_FORMAT_INVALID")
            info_dir = next(iter(info_dirs))
            identity = info_dir.removesuffix(".dist-info").rsplit("-", 1)
            require(len(identity) == 2 and canonicalize_name(identity[0]) == name
                    and identity[1] == dependencies[name], "SERVICE_TARGET_WHEEL_FORMAT_INVALID")

            def headers(filename):
                entry = info_dir + "/" + filename
                require(entry in names, "SERVICE_TARGET_WHEEL_FORMAT_INVALID")
                item = archive.getinfo(entry)
                require(0 < item.file_size <= 512 * 1024, "SERVICE_TARGET_WHEEL_METADATA_INVALID")
                with archive.open(item) as stream:
                    data = stream.read(512 * 1024 + 1)
                require(len(data) == item.file_size, "SERVICE_TARGET_WHEEL_METADATA_INVALID")
                return BytesParser().parsebytes(data, headersonly=True)

            wheel_doc = headers("WHEEL")
            require(wheel_doc.get_all("Wheel-Version", []) == ["1.0"]
                    and wheel_doc.get_all("Root-Is-Purelib", []) in (["true"], ["false"]),
                    "SERVICE_TARGET_WHEEL_FORMAT_INVALID")
            declared_tags = set()
            for tag in wheel_doc.get_all("Tag", []):
                declared_tags.update(parse_tag(tag))
            require(declared_tags == tags, "SERVICE_TARGET_WHEEL_FORMAT_INVALID")
            doc = headers("METADATA")
            require(len(doc.get_all("Name", [])) == 1 and len(doc.get_all("Version", [])) == 1
                    and canonicalize_name(doc["Name"]) == name and doc["Version"] == dependencies[name],
                    "SERVICE_TARGET_WHEEL_METADATA_MISMATCH")
            require(len(doc.get_all("Requires-Python", [])) <= 1, "SERVICE_TARGET_WHEEL_METADATA_INVALID")
            requires_python = SpecifierSet(doc.get("Requires-Python", ""))
            python_compatible = requires_python.contains(platform.python_version(), prereleases=True)
            # The installer uses --no-deps: an inventory match alone cannot
            # prove that these pins satisfy the wheel's active dependencies.
            # No package extras are requested by this exact service lock.
            for value in doc.get_all("Requires-Dist", []):
                requirement = Requirement(value)
                if requirement.marker and not requirement.marker.evaluate({"extra": ""}):
                    continue
                require(not requirement.url and not requirement.extras,
                        "SERVICE_TARGET_WHEEL_REQUIREMENT_UNSUPPORTED")
                dependency = canonicalize_name(requirement.name)
                require(dependency in dependencies
                        and requirement.specifier.contains(dependencies[dependency], prereleases=True),
                        "SERVICE_TARGET_WHEEL_REQUIREMENT_MISMATCH")
        records[name] = {"version": dependencies[name], "sha256": hashlib.sha256(raw).hexdigest(),
                         "compatible": bool(tags & supported), "python_compatible": python_compatible}
    require(set(records) == set(dependencies), "SERVICE_TARGET_WHEEL_CLOSURE_INCOMPLETE")
    return records


def collect(manifest_path, expected, wheelhouse):
    require(sys.flags.isolated, "SERVICE_TARGET_ISOLATED_PYTHON_REQUIRED")
    manifest = manifest_input(manifest_path, expected)
    try:
        from pip._vendor.packaging.tags import sys_tags
    except ImportError:
        raise PreflightError("SERVICE_TARGET_PIP_TAGS_UNAVAILABLE") from None
    wheels = wheel_inventory(wheelhouse, manifest["dependencies"], set(sys_tags()))
    system, kernel = platform.system(), platform.release().lower()
    wsl2 = system == "Linux" and "microsoft" in kernel and "wsl2" in kernel
    checks = []
    for name, passed, success, failure in (
        ("python", sys.version_info[:2] == (3, 14), "PYTHON_MATCH", "PYTHON_314_REQUIRED"),
        ("wsl2", wsl2, "WSL2_DETECTED", "WSL2_REQUIRED"),
        ("wheel-tags", all(w["compatible"] for w in wheels.values()), "WHEEL_TAGS_MATCH", "WHEEL_PLATFORM_MISMATCH"),
        ("wheel-python", all(w["python_compatible"] for w in wheels.values()), "WHEEL_PYTHON_MATCH", "WHEEL_PYTHON_MISMATCH"),
    ):
        checks.append({"id": name, "status": "PASS" if passed else "BLOCKED",
                       "code": "SERVICE_TARGET_" + (success if passed else failure)})
    ok = all(item["status"] == "PASS" for item in checks)
    return {
        "schema_version": "shinemage-service-target-preflight/v1",
        "scope": "read-only-service-target-readiness",
        "status": "SERVICE_TARGET_PREFLIGHT_PASS" if ok else "SERVICE_TARGET_PREFLIGHT_BLOCKED",
        "manifest_sha256": expected,
        "service": {"name": manifest["name"], "version": manifest["version"]},
        "platform": {"system": system, "machine": platform.machine(),
                     "python": platform.python_version(), "wsl2_detected": wsl2},
        "checks": checks, "wheels": wheels,
        "release_ready": False, "activation": "BLOCKED",
        "acceptance": {name: "NOT_RUN" for name in (
            "cold_install", "identity_and_state", "http_recovery", "supply_chain")},
    }


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise PreflightError("SERVICE_TARGET_ARGUMENTS_INVALID")


def main():
    parser = Parser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--wheelhouse", type=Path, required=True)
    args = parser.parse_args()
    for flag in ("--manifest", "--manifest-sha256", "--wheelhouse"):
        require(sum(arg == flag or arg.startswith(flag + "=") for arg in sys.argv[1:]) == 1,
                "SERVICE_TARGET_ARGUMENTS_INVALID")
    report = collect(args.manifest, args.manifest_sha256, args.wheelhouse)
    print(json.dumps(report, sort_keys=True))
    return 0 if report["status"] == "SERVICE_TARGET_PREFLIGHT_PASS" else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        code = str(error) if isinstance(error, PreflightError) else "SERVICE_TARGET_INPUT_INVALID"
        print(json.dumps({"schema_version": "shinemage-service-target-preflight/v1",
                          "status": "SERVICE_TARGET_PREFLIGHT_INVALID", "code": code,
                          "release_ready": False, "activation": "BLOCKED"}))
        sys.exit(2)
