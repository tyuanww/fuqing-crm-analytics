"""Owned private files. Request bodies never supply these paths."""

from __future__ import annotations

import os
import stat
from pathlib import Path


def require_private_directory(value) -> Path:
    original = Path(value)
    if original.is_symlink():
        raise ValueError("directory cannot be a symlink")
    path = original.resolve(strict=True)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("directory must be private and owned")
    return path


def make_private_directory(path: Path) -> Path:
    path.mkdir(mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)
    return require_private_directory(path)


def require_private_file(path: Path, *, limit: int) -> Path:
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError("file cannot be a symlink")
    resolved = path.resolve(strict=True)
    info = resolved.stat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_nlink != 1
        or info.st_mode & 0o077
        or info.st_size > limit
    ):
        raise ValueError("file must be a small owned private regular file")
    return resolved
