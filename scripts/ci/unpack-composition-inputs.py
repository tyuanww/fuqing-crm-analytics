"""Bounded GitHub artifact ZIP reader for sealed plugin and domain packs."""
import re
import stat
import sys
from pathlib import Path, PurePosixPath
from zipfile import ZipFile


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError(code)


def unpack(source: Path, destination: Path) -> None:
    require(source.is_file() and not source.is_symlink(), "CI_COMPOSITION_ARCHIVE_INVALID")
    require(0 < source.stat().st_size <= 64 * 1024 * 1024, "CI_COMPOSITION_ARCHIVE_SIZE")
    with ZipFile(source) as archive:
        entries = archive.infolist()
        require(0 < len(entries) <= 128, "CI_COMPOSITION_ARCHIVE_ENTRIES")
        require(sum(item.file_size for item in entries) <= 64 * 1024 * 1024, "CI_COMPOSITION_ARCHIVE_SIZE")
        require(len({item.filename for item in entries}) == len(entries), "CI_COMPOSITION_ARCHIVE_DUPLICATE")
        for item in entries:
            path = PurePosixPath(item.filename)
            require(not path.is_absolute() and not any(part in (".", "..") for part in path.parts), "CI_COMPOSITION_ARCHIVE_PATH")
            require("\\" not in item.filename and not item.flag_bits & 1, "CI_COMPOSITION_ARCHIVE_PATH")
            mode = item.external_attr >> 16
            require(stat.S_IFMT(mode) in (0, stat.S_IFDIR if item.is_dir() else stat.S_IFREG), "CI_COMPOSITION_ARCHIVE_SPECIAL")
            if item.is_dir():
                require(re.fullmatch(r"packs/(?:[a-z][a-z0-9-]*/)?|domain/", item.filename), "CI_COMPOSITION_ARCHIVE_PATH")
            else:
                require(re.fullmatch(r"packs/[a-z][a-z0-9-]*/(?:plugin-pack\.json|shine-mage-dsh-[a-z0-9.-]+\.tgz)|domain/(?:board-components-pack\.json|shine-mage-board-components-0\.1\.0\.tgz)", item.filename), "CI_COMPOSITION_ARCHIVE_PATH")
                require(0 < item.file_size <= 20 * 1024 * 1024, "CI_COMPOSITION_ARCHIVE_MEMBER_SIZE")
        destination.mkdir(mode=0o700)
        for item in entries:
            if item.is_dir():
                continue
            target = destination / item.filename
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with target.open("xb") as output:
                output.write(archive.read(item))


if __name__ == "__main__":
    unpack(Path(sys.argv[1]), Path(sys.argv[2]))
