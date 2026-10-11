"""Read three bounded members from an already hashed CI archive, without extraction."""
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


raw = sys.stdin.buffer.read(MAX_ARCHIVE + 1)
require(len(raw) <= MAX_ARCHIVE, "WORKBENCH_AUTHOR_ARCHIVE_SIZE")
require(sys.version_info >= (3, 14), "WORKBENCH_AUTHOR_PYTHON")
requested = json.loads(sys.argv[1])
with zipfile.ZipFile(io.BytesIO(raw)) as archive:
    entries = archive.infolist()
    require(len(entries) <= 256, "WORKBENCH_AUTHOR_ARCHIVE_ENTRIES")
    require(len({entry.filename for entry in entries}) == len(entries), "WORKBENCH_AUTHOR_ARCHIVE_DUPLICATE")
    require(sum(entry.file_size for entry in entries) <= 8 * 1024 * 1024, "WORKBENCH_AUTHOR_ARCHIVE_EXPANSION")
    for entry in entries:
        path = PurePosixPath(entry.filename)
        require(not path.is_absolute() and ".." not in path.parts and "\\" not in entry.filename, "WORKBENCH_AUTHOR_ARCHIVE_PATH")
        kind = stat.S_IFMT(entry.external_attr >> 16)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), "WORKBENCH_AUTHOR_ARCHIVE_SPECIAL")
        require(not entry.flag_bits & 1, "WORKBENCH_AUTHOR_ARCHIVE_ENCRYPTED")
    result = {}
    for name, descriptor in requested.items():
        member = archive.getinfo(descriptor["path"])
        require(not member.is_dir() and member.file_size == descriptor["bytes"], "WORKBENCH_AUTHOR_MEMBER_SIZE")
        value = archive.read(member)
        require(hashlib.sha256(value).hexdigest() == descriptor["sha256"], "WORKBENCH_AUTHOR_MEMBER_DIGEST")
        result[name] = json.loads(value) if name != "content_pack" else {"bytes": len(value), "sha256": descriptor["sha256"]}
    print(json.dumps(result, ensure_ascii=False))
