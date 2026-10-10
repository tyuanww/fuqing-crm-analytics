"""Test-only venv containing exactly the declared dependency closure.

Default: copy the installed lock closure. --wheelhouse: cold install hashed
wheels offline using the caller's pip, without installing pip in the target.
Neither mode claims a WSL deployment or publisher authenticity.
"""
import argparse
from email.parser import BytesParser
import hashlib
from importlib.metadata import distribution
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import venv
import zipfile


def install_wheels(manifest, destination, wheelhouse):
    if not wheelhouse.is_absolute() or wheelhouse.is_symlink() or not wheelhouse.is_dir():
        raise ValueError("SERVICE_WHEELHOUSE_INVALID")
    records = {}
    wheels = sorted(wheelhouse.glob("*.whl"))
    if not 1 <= len(wheels) <= 100:
        raise ValueError("SERVICE_WHEELHOUSE_INVALID")
    for wheel in wheels:
        if wheel.is_symlink() or not wheel.is_file() or wheel.stat().st_size > 64 * 1024 * 1024:
            raise ValueError("SERVICE_WHEEL_INVALID")
        with zipfile.ZipFile(wheel) as archive:
            entries = [i for i in archive.infolist() if i.filename.endswith(".dist-info/METADATA")]
            if len(entries) != 1 or entries[0].file_size > 512 * 1024:
                raise ValueError("SERVICE_WHEEL_METADATA_INVALID")
            meta = BytesParser().parsebytes(archive.read(entries[0]))
        name = re.sub(r"[-_.]+", "-", meta["Name"].lower())
        if name in records or manifest["dependencies"].get(name) != meta["Version"]:
            raise ValueError("SERVICE_WHEEL_DEPENDENCY_MISMATCH")
        records[name] = {"file": wheel.name, "version": meta["Version"],
                         "sha256": hashlib.sha256(wheel.read_bytes()).hexdigest()}
    if set(records) != set(manifest["dependencies"]):
        raise ValueError("SERVICE_WHEEL_CLOSURE_INCOMPLETE")
    lock = destination / ".install-requirements.txt"
    lock.write_text("".join(f"{name}=={row['version']} --hash=sha256:{row['sha256']}\n"
                            for name, row in sorted(records.items())))
    interpreter = destination / "bin/python"
    try:
        subprocess.run([sys.executable, "-I", "-m", "pip", "--isolated", "--disable-pip-version-check",
                        "--python", str(interpreter), "install", "--no-index", "--no-deps", "--no-compile",
                        "--only-binary", ":all:", "--require-hashes", "--find-links", str(wheelhouse),
                        "-r", str(lock)], check=True, capture_output=True, timeout=60,
                       env={"PATH": str(Path(sys.executable).parent) + os.pathsep + "/usr/bin:/bin",
                            "HOME": str(destination), "PIP_CONFIG_FILE": os.devnull})
    finally:
        lock.unlink()
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest_path", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--wheelhouse", type=Path)
    args = parser.parse_args()
    manifest_path, destination = args.manifest_path, args.destination
    if not manifest_path.is_absolute() or not destination.is_absolute():
        raise ValueError("SERVICE_RUNTIME_ABSOLUTE_PATH_REQUIRED")
    if destination.exists():
        raise ValueError("fixture destination must be new")
    manifest = json.loads(manifest_path.read_text())
    venv.EnvBuilder(with_pip=False, symlinks=True).create(destination)
    if args.wheelhouse:
        wheels = install_wheels(manifest, destination, args.wheelhouse)
        print(json.dumps({"python": str(destination / "bin/python"), "mode": "offline-hashed-wheel-install",
                          "wheels": wheels}))
        return
    site = destination / f"lib/python{sys.version_info.major}.{sys.version_info.minor}/site-packages"
    site.mkdir(parents=True, exist_ok=True)
    for name, expected in manifest["dependencies"].items():
        dist = distribution(name)
        if dist.version != expected or not dist.files:
            raise ValueError("fixture dependency version or file inventory missing")
        source_root = Path(dist.locate_file("")).resolve()
        for entry in dist.files:
            rel = PurePosixPath(str(entry))
            # Console scripts are unnecessary: production entry imports uvicorn.
            if rel.is_absolute() or ".." in rel.parts or "__pycache__" in rel.parts:
                continue
            source = Path(dist.locate_file(entry)).resolve()
            if not source.is_relative_to(source_root) or not source.is_file():
                raise ValueError("fixture dependency path escaped site packages")
            target = site / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    print(destination / "bin/python")


if __name__ == "__main__":
    main()
