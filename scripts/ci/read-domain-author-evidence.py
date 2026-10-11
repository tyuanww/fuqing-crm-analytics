"""Inspect fixed domain owner ZIP/TAP/library members in memory; never execute or extract."""
import base64
import hashlib
import io
import json
from pathlib import PurePosixPath
import stat
import sys
import tarfile
import zipfile

MAX_BYTES = 4 * 1024 * 1024


def require(condition, code):
    if not condition:
        raise ValueError(code)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def library(value):
    members = {}
    with tarfile.open(fileobj=io.BytesIO(value), mode="r:gz") as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            require(len(members) < 5, "DOMAIN_AUTHOR_LIBRARY_ENTRIES")
            require(member.isfile() and not path.is_absolute() and ".." not in path.parts
                    and "\\" not in member.name and member.name not in members,
                    "DOMAIN_AUTHOR_LIBRARY_PATH")
            require(member.size <= 256 * 1024, "DOMAIN_AUTHOR_LIBRARY_SIZE")
            value = archive.extractfile(member).read(256 * 1024 + 1)
            require(len(value) == member.size, "DOMAIN_AUTHOR_LIBRARY_SIZE")
            members[member.name] = {"bytes": len(value), "sha256": digest(value)}
        require(len(members) == 5, "DOMAIN_AUTHOR_LIBRARY_ENTRIES")
    return members


def inspect(raw, requested):
    require(sys.version_info >= (3, 14), "DOMAIN_AUTHOR_PYTHON")
    require(len(raw) <= MAX_BYTES, "DOMAIN_AUTHOR_ARCHIVE_SIZE")
    result = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        require(len(entries) <= 100, "DOMAIN_AUTHOR_ARCHIVE_ENTRIES")
        require(len({row.filename for row in entries}) == len(entries), "DOMAIN_AUTHOR_ARCHIVE_DUPLICATE")
        require(sum(row.file_size for row in entries) <= 8 * 1024 * 1024,
                "DOMAIN_AUTHOR_ARCHIVE_EXPANSION")
        for row in entries:
            path = PurePosixPath(row.filename)
            require(row.filename and not path.is_absolute() and ".." not in path.parts
                    and "\\" not in row.filename and not row.flag_bits & 1,
                    "DOMAIN_AUTHOR_ARCHIVE_PATH")
            require(stat.S_IFMT(row.external_attr >> 16) in (0, stat.S_IFREG, stat.S_IFDIR),
                    "DOMAIN_AUTHOR_ARCHIVE_SPECIAL")
        for name, descriptor in requested.items():
            row = archive.getinfo(descriptor["path"])
            require(not row.is_dir() and row.file_size == descriptor["bytes"], "DOMAIN_AUTHOR_MEMBER_SIZE")
            value = archive.read(row)
            require(digest(value) == descriptor["sha256"], "DOMAIN_AUTHOR_MEMBER_DIGEST")
            if name == "receipt":
                result[name] = json.loads(value)
            elif name in ("reference", "content_pack"):
                result[name] = library(value)
                if name == "reference":
                    result["reference_base64"] = base64.b64encode(value).decode("ascii")
            else:
                result[name] = value.decode("utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(inspect(sys.stdin.buffer.read(MAX_BYTES + 1), json.loads(sys.argv[1])),
                     ensure_ascii=False))
