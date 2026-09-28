#!/usr/bin/env python3
"""Bounded runtime receiver. Relative symlinks are allowed only inside the stage."""

from __future__ import annotations

import argparse
import os
import pathlib
import posixpath
import shutil
import stat
import subprocess
import tarfile
import tempfile


def fail(code: str, detail: str = "") -> None:
    raise SystemExit(f"{code}{(' ' + detail) if detail else ''}")


def safe_name(raw: str) -> pathlib.PurePosixPath | None:
    name = raw
    while name.startswith("./"):
        name = name[2:]
    if name in ("", "."):
        return None
    if "\\" in name or name.startswith("/"):
        fail("RUNTIME_PATH_INVALID", raw)
    path = pathlib.PurePosixPath(name)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        fail("RUNTIME_PATH_INVALID", raw)
    return path


def safe_link(path: pathlib.PurePosixPath, linkname: str) -> None:
    if not linkname or "\\" in linkname or linkname.startswith("/"):
        fail("RUNTIME_LINK_INVALID", str(path))
    resolved = pathlib.PurePosixPath(posixpath.normpath(posixpath.join(str(path.parent), linkname)))
    if resolved.is_absolute() or any(part in ("", ".", "..") for part in resolved.parts):
        fail("RUNTIME_LINK_ESCAPE", f"{path} -> {linkname}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("archive")
    ap.add_argument("destination")
    ap.add_argument("--max-entries", type=int, default=1_000_000)
    ap.add_argument("--max-bytes", type=int, default=2 * 1024 * 1024 * 1024)
    args = ap.parse_args()
    if args.max_entries <= 0 or args.max_bytes <= 0:
        fail("RUNTIME_LIMIT_INVALID")
    dest = pathlib.Path(args.destination).absolute()
    if dest.exists():
        fail("DESTINATION_MUST_NOT_EXIST", str(dest))
    dest.parent.mkdir(parents=True, exist_ok=True)
    stage = pathlib.Path(tempfile.mkdtemp(prefix=".runtime-unpack-", dir=str(dest.parent))).resolve()
    tar_path: pathlib.Path | None = None
    count = 0
    total = 0
    seen: set[str] = set()
    try:
        fd, name = tempfile.mkstemp(prefix="dsh-runtime-", suffix=".tar", dir=str(dest.parent))
        os.close(fd)
        tar_path = pathlib.Path(name)
        proc = subprocess.Popen(["zstd", "-q", "-d", "-c", args.archive], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            assert proc.stdout is not None
            with tar_path.open("wb") as out:
                while chunk := proc.stdout.read(1024 * 1024):
                    total += len(chunk)
                    if total > args.max_bytes:
                        fail("RUNTIME_ARCHIVE_SIZE_LIMIT", str(total))
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            err = (proc.stderr.read() if proc.stderr else b"").decode(errors="replace").strip()
            if proc.wait() != 0:
                fail("RUNTIME_DECOMPRESS_FAILED", err)
        finally:
            if proc.poll() is None:
                proc.kill()
            proc.wait()
            if proc.stdout:
                proc.stdout.close()
            if proc.stderr:
                proc.stderr.close()

        total = 0
        with tarfile.open(tar_path, "r:") as archive:
            for member in archive:
                count += 1
                if count > args.max_entries:
                    fail("RUNTIME_ENTRY_LIMIT", str(count))
                rel = safe_name(member.name)
                if rel is None:
                    continue
                key = rel.as_posix()
                if key in seen:
                    fail("RUNTIME_DUPLICATE_PATH", key)
                seen.add(key)
                if member.isdir():
                    target = (stage / pathlib.Path(*rel.parts)).resolve()
                    if stage != target and stage not in target.parents:
                        fail("RUNTIME_PATH_INVALID", key)
                    target.mkdir(parents=True, exist_ok=True)
                    os.chmod(target, (member.mode & 0o777) & ~0o022 or 0o700)
                    continue
                if member.isfile():
                    target = stage / pathlib.Path(*rel.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    resolved_parent = target.parent.resolve()
                    if stage != resolved_parent and stage not in resolved_parent.parents:
                        fail("RUNTIME_PATH_INVALID", key)
                    if member.size < 0 or total + member.size > args.max_bytes:
                        fail("RUNTIME_SIZE_LIMIT", key)
                    total += member.size
                    source = archive.extractfile(member)
                    if source is None:
                        fail("RUNTIME_READ_FAILED", key)
                    with target.open("xb") as out:
                        copied = 0
                        while chunk := source.read(1024 * 1024):
                            copied += len(chunk)
                            if copied > member.size:
                                fail("RUNTIME_SIZE_MISMATCH", key)
                            out.write(chunk)
                        if copied != member.size:
                            fail("RUNTIME_SIZE_MISMATCH", key)
                        out.flush()
                        os.fsync(out.fileno())
                    os.chmod(target, (member.mode & 0o777) & ~0o022 or 0o600)
                    continue
                if member.issym():
                    safe_link(rel, member.linkname)
                    target = stage / pathlib.Path(*rel.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    resolved_parent = target.parent.resolve()
                    if stage != resolved_parent and stage not in resolved_parent.parents:
                        fail("RUNTIME_PATH_INVALID", key)
                    os.symlink(member.linkname, target)
                    continue
                if member.islnk():
                    link_rel = safe_name(member.linkname)
                    if link_rel is None:
                        fail("RUNTIME_HARDLINK_TARGET_INVALID", key)
                    source = stage / pathlib.Path(*link_rel.parts)
                    target = stage / pathlib.Path(*rel.parts)
                    resolved_source = source.resolve()
                    resolved_parent = target.parent.resolve()
                    if (stage != resolved_source and stage not in resolved_source.parents) or (stage != resolved_parent and stage not in resolved_parent.parents):
                        fail("RUNTIME_HARDLINK_ESCAPE", key)
                    try:
                        source_mode = os.lstat(source).st_mode
                    except FileNotFoundError:
                        fail("RUNTIME_HARDLINK_TARGET_MISSING", f"{key} -> {member.linkname}")
                    if not stat.S_ISREG(source_mode):
                        fail("RUNTIME_HARDLINK_TARGET_INVALID", f"{key} -> {member.linkname}")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if target.exists() or target.is_symlink():
                        fail("RUNTIME_DUPLICATE_PATH", key)
                    os.link(source, target)
                    continue
                fail("RUNTIME_MEMBER_TYPE_INVALID", key)
        os.rename(stage, dest)
        stage = None  # type: ignore[assignment]
        print(f"RUNTIME_UNPACK_PASS entries={count} bytes={total} destination={dest}")
    finally:
        if tar_path:
            tar_path.unlink(missing_ok=True)
        if stage and stage.exists():
            shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    main()
