"""Inspect contract-only CI ZIPs in memory; never execute or extract members."""
import base64
import hashlib
import io
import json
from pathlib import PurePosixPath
import stat
import sys
import zipfile

MAX_ARCHIVE = 4 * 1024 * 1024


def require(condition, code):
    if not condition:
        raise ValueError(code)


def inspect(raw, expected):
    require(sys.version_info >= (3, 14), "PUBLIC_CONTRACT_PYTHON")
    require(len(raw) <= MAX_ARCHIVE, "PUBLIC_CONTRACT_ARCHIVE_SIZE")
    result = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        require(len(entries) <= 100, "PUBLIC_CONTRACT_ENTRIES")
        require(len({row.filename for row in entries}) == len(entries), "PUBLIC_CONTRACT_DUPLICATE")
        require(sum(row.file_size for row in entries) <= 2 * 1024 * 1024, "PUBLIC_CONTRACT_EXPANSION")
        for row in entries:
            path = PurePosixPath(row.filename)
            require(row.filename and not path.is_absolute() and ".." not in path.parts
                    and "." not in path.parts and "\\" not in row.filename
                    and str(path) == row.filename.rstrip("/") and not row.flag_bits & 1,
                    "PUBLIC_CONTRACT_PATH")
            require(stat.S_IFMT(row.external_attr >> 16) in (0, stat.S_IFREG, stat.S_IFDIR),
                    "PUBLIC_CONTRACT_SPECIAL")
            require(row.file_size <= 512 * 1024, "PUBLIC_CONTRACT_MEMBER_SIZE")
            if row.is_dir():
                require(any(name.startswith(row.filename) for name in expected), "PUBLIC_CONTRACT_DIRECTORY")
        files = {row.filename for row in entries if not row.is_dir()}
        require(files == set(expected), "PUBLIC_CONTRACT_FILE_SET")
        for path, descriptor in expected.items():
            row = archive.getinfo(path)
            require(not row.is_dir() and row.file_size == descriptor["bytes"], "PUBLIC_CONTRACT_MEMBER_SIZE")
            data = archive.read(row)
            require(hashlib.sha256(data).hexdigest() == descriptor["sha256"], "PUBLIC_CONTRACT_MEMBER_DIGEST")
            result[path] = base64.b64encode(data).decode("ascii")
    return result


if __name__ == "__main__":
    print(json.dumps(inspect(sys.stdin.buffer.read(MAX_ARCHIVE + 1), json.loads(sys.argv[1]))))
