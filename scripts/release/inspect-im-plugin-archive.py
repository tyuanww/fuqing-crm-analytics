#!/usr/bin/env python3
"""Read a pinned GitHub source archive without extracting it to disk."""

from __future__ import annotations

import argparse
import json
import pathlib
import tarfile


def fail(code: str) -> None:
    raise SystemExit(code)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive")
    parser.add_argument("commit")
    parser.add_argument("--max-entries", type=int, default=20000)
    parser.add_argument("--max-bytes", type=int, default=64 * 1024 * 1024)
    parser.add_argument("--max-package-bytes", type=int, default=256 * 1024)
    args = parser.parse_args()

    archive = pathlib.Path(args.archive)
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size > args.max_bytes:
        fail("IM_ARCHIVE_INVALID")

    root = None
    entries = 0
    total = 0
    package_member = None
    seen = set()
    with tarfile.open(archive, "r:*") as source:
        for member in source:
            entries += 1
            if entries > args.max_entries:
                fail("IM_ARCHIVE_ENTRY_LIMIT")
            name = member.name
            if not name or "\\" in name or name.startswith("/"):
                fail("IM_ARCHIVE_PATH_INVALID")
            if not (member.isdir() or member.isfile()):
                fail("IM_ARCHIVE_LINK_OR_DEVICE")
            canonical_name = name[:-1] if member.isdir() and name.endswith("/") else name
            parts = tuple(canonical_name.split("/"))
            if not parts or any(part in ("", ".", "..") for part in parts):
                fail("IM_ARCHIVE_PATH_INVALID")
            key = "/".join(parts)
            if key in seen:
                fail("IM_ARCHIVE_DUPLICATE_PATH")
            seen.add(key)
            if root is None:
                root = parts[0]
            if parts[0] != root:
                fail("IM_ARCHIVE_ROOT_INVALID")
            if not root.endswith("-" + args.commit):
                fail("IM_ARCHIVE_COMMIT_MISMATCH")
            if member.isfile():
                if member.size < 0 or total + member.size > args.max_bytes:
                    fail("IM_ARCHIVE_SIZE_LIMIT")
                total += member.size
                if parts == (root, "package.json"):
                    package_member = member

    if root is None or package_member is None or package_member.size > args.max_package_bytes:
        fail("IM_ARCHIVE_PACKAGE_MISSING")
    with tarfile.open(archive, "r:*") as source:
        stream = source.extractfile(package_member)
        if stream is None:
            fail("IM_ARCHIVE_PACKAGE_MISSING")
        payload = stream.read(args.max_package_bytes + 1)
    if len(payload) != package_member.size or len(payload) > args.max_package_bytes:
        fail("IM_ARCHIVE_PACKAGE_INVALID")
    try:
        package = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail("IM_ARCHIVE_PACKAGE_INVALID")
    if not isinstance(package, dict):
        fail("IM_ARCHIVE_PACKAGE_INVALID")
    print(json.dumps({
        "root": root,
        "entries": entries,
        "bytes": total,
        "package": {
            "name": package.get("name"),
            "version": package.get("version"),
        },
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
