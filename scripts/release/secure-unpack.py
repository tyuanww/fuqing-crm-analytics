#!/usr/bin/env python3
"""Bounded, fail-closed tar receiver. Validation and writes happen in an exclusive staging directory."""

from __future__ import annotations
import argparse
import json
import os
import pathlib
import subprocess
import tarfile
import tempfile
import shutil


def fail(code: str, detail: str = "") -> None:
    raise SystemExit(f"{code}{(' ' + detail) if detail else ''}")


def safe_parts(name: str) -> pathlib.PurePosixPath:
    if not name or "\\" in name or name.startswith("/"):
        fail("ARCHIVE_PATH_INVALID", name)
    path = pathlib.PurePosixPath(name)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        fail("ARCHIVE_PATH_INVALID", name)
    return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    ap.add_argument("destination")
    ap.add_argument("--max-entries", type=int, default=10000)
    ap.add_argument("--max-bytes", type=int, default=512 * 1024 * 1024)
    args = ap.parse_args()
    dest = pathlib.Path(args.destination).absolute()
    if dest.exists():
        fail("DESTINATION_MUST_NOT_EXIST", str(dest))
    dest.parent.mkdir(parents=True, exist_ok=True)
    stage = pathlib.Path(
        tempfile.mkdtemp(prefix=".unpack-", dir=str(dest.parent))
    ).resolve()
    tar_path = None
    total = 0
    seen = set()
    count = 0
    try:
        # Stream zstd output into a bounded temporary tar. A compressed archive cannot
        # consume unlimited disk: stop reading as soon as the declared cap is crossed.
        fd, name = tempfile.mkstemp(
            prefix="dsh-receive-", suffix=".tar", dir=str(dest.parent)
        )
        os.close(fd)
        tar_path = pathlib.Path(name)
        if args.archive.endswith(".zst"):
            proc = subprocess.Popen(
                ["zstd", "-q", "-d", "-c", args.archive],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            source = proc.stdout
            with tar_path.open("wb") as out:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > args.max_bytes:
                        proc.kill()
                        fail("ARCHIVE_SIZE_LIMIT", str(total))
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            err = proc.stderr.read().decode(errors="replace").strip()
            code = proc.wait()
            if code != 0:
                fail("ARCHIVE_DECOMPRESS_FAILED", err)
            tar_mode = "r:"
        else:
            with open(args.archive, "rb") as source, tar_path.open("wb") as out:
                while chunk := source.read(1024 * 1024):
                    total += len(chunk)
                    if total > args.max_bytes:
                        fail("ARCHIVE_SIZE_LIMIT", str(total))
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            tar_mode = "r:*"
        total = 0
        with tarfile.open(tar_path, tar_mode) as archive:
            for member in archive:
                count += 1
                if count > args.max_entries:
                    fail("ARCHIVE_ENTRY_LIMIT", str(count))
                rel = safe_parts(member.name)
                key = rel.as_posix()
                if key in seen:
                    fail("ARCHIVE_DUPLICATE_PATH", key)
                seen.add(key)
                if not (member.isdir() or member.isfile()):
                    fail("ARCHIVE_LINK_OR_DEVICE", key)
                mode = member.mode & 0o777
                if mode & 0o022:
                    fail("ARCHIVE_PERMISSION_TOO_WIDE", f"{key}:{oct(mode)}")
                target = (stage / pathlib.Path(*rel.parts)).resolve()
                if stage != target and stage not in target.parents:
                    fail("ARCHIVE_PATH_INVALID", key)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                    os.chmod(target, mode or 0o700)
                    continue
                if member.size < 0 or total + member.size > args.max_bytes:
                    fail("ARCHIVE_SIZE_LIMIT", key)
                total += member.size
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    fail("ARCHIVE_DUPLICATE_PATH", key)
                src = archive.extractfile(member)
                if src is None:
                    fail("ARCHIVE_READ_FAILED", key)
                with target.open("xb") as out:
                    copied = 0
                    while chunk := src.read(1024 * 1024):
                        copied += len(chunk)
                        if copied > member.size:
                            fail("ARCHIVE_SIZE_MISMATCH", key)
                        out.write(chunk)
                    if copied != member.size:
                        fail("ARCHIVE_SIZE_MISMATCH", key)
                    out.flush()
                    os.fsync(out.fileno())
                os.chmod(target, mode or 0o600)
        os.rename(stage, dest)
        stage = None
        print(
            json.dumps(
                {"ok": True, "entries": count, "bytes": total, "destination": str(dest)}
            )
        )
    finally:
        if tar_path:
            tar_path.unlink(missing_ok=True)
        if stage and stage.exists():
            shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    main()
