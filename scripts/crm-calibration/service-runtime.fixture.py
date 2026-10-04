"""Offline test-only venv populated with exactly the declared installed closure.

No pip, download, user site or repository on sys.path. This tests minimal runtime
imports; it is not evidence of a cold wheelhouse install or a WSL deployment.
"""
from importlib.metadata import distribution
import json
from pathlib import Path, PurePosixPath
import shutil
import sys
import venv


def main():
    manifest_path, destination = map(Path, sys.argv[1:])
    if destination.exists():
        raise ValueError("fixture destination must be new")
    manifest = json.loads(manifest_path.read_text())
    venv.EnvBuilder(with_pip=False, symlinks=True).create(destination)
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
