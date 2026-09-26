#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import os
import pathlib
import stat
import subprocess
import tarfile
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("root")
parser.add_argument("allowlist")
parser.add_argument("output")
args = parser.parse_args()
root = pathlib.Path(args.root).resolve()
allow = json.loads(pathlib.Path(args.allowlist).read_text())
with tempfile.TemporaryDirectory(prefix="dsh-pack-") as tmp:
    tar_path = pathlib.Path(tmp) / "payload.tar"
    with tarfile.open(tar_path, "w") as tar:
        for rel in sorted(set(allow)):
            if (
                not isinstance(rel, str)
                or rel.startswith("/")
                or ".." in pathlib.PurePosixPath(rel).parts
                or "\\" in rel
            ):
                raise SystemExit(f"PACK_UNSAFE_PATH {rel!r}")
            path = root / rel
            if not path.is_file() or path.is_symlink():
                raise SystemExit(f"PACK_UNSAFE_PATH {rel}")
            info = tar.gettarinfo(str(path), arcname=rel)
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            info.mtime = 0
            info.mode = 0o700 if path.stat().st_mode & stat.S_IXUSR else 0o600
            with path.open("rb") as source:
                tar.addfile(info, source)
    out = pathlib.Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["zstd", "-q", "-f", str(tar_path), "-o", str(out)], check=True)
    os.chmod(out, 0o600)
