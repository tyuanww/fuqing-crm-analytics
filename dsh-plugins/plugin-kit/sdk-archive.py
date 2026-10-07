#!/usr/bin/env python3
"""Local, integrity-bound development SDK transport. Never a production installer.

ZIP stores only content-addressed regular blobs and a strict manifest. Links are
validated as a closed graph, then created last. No archive extraction API, hooks,
caller Git configuration, network download, or existing destination replacement.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
import pathlib
import posixpath
import re
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
import zlib

KIT = pathlib.Path(__file__).resolve().parent
ROOTS = ('upstream', 'build-tools', 'corepack')
MAX_ENTRIES = 200_000
MAX_BYTES = 4 * 1024**3
MAX_MANIFEST = 64 * 1024**2
MAX_DIRECTORY = 64 * 1024**2
SCHEMA = 'shinemage-development-sdk-archive/v1'
HEX = re.compile(r'[a-f0-9]{64}\Z')
GIT_FILE = re.compile(r'upstream/\.git/(?:HEAD|index|shallow|objects/(?:[a-f0-9]{2}/[a-f0-9]{38}|pack/pack-[a-f0-9]{40}\.(?:pack|idx)))\Z')
GIT_DIR = re.compile(r'upstream/\.git(?:/(?:objects(?:/(?:pack|[a-f0-9]{2}))?|refs))?\Z')


class Invalid(Exception):
    pass


def need(condition, code):
    if not condition:
        raise Invalid('KIT_ARCHIVE_' + code)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, 'JSON_DUPLICATE')
        result[key] = value
    return result


def json_load(data):
    try:
        return json.loads(data, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError) as error:
        raise Invalid('KIT_ARCHIVE_JSON') from error


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(stream):
    h = hashlib.sha256()
    while chunk := stream.read(1024 * 1024):
        h.update(chunk)
    return h.hexdigest()


def keys(value, expected):
    need(type(value) is dict and set(value) == set(expected), 'FIELDS')


def path_parts(name):
    need(isinstance(name, str) and 0 < len(name) <= 2048, 'PATH')
    need(not any(ord(c) < 32 or ord(c) == 127 or c in '\\:' for c in name), 'PATH')
    parts = name.split('/')
    need(parts[0] in ROOTS and all(p and p not in ('.', '..') for p in parts), 'PATH')
    return parts


def permitted(name, kind):
    """Only transport build roots; never transport caller state or Git hooks/config."""
    parts = path_parts(name)
    if '.git' in parts:
        return bool((GIT_DIR if kind == 'dir' else GIT_FILE).fullmatch(name)) and kind != 'link'
    if name in ('upstream/apps/desktop/.env.macos.example', 'upstream/apps/desktop/.env.windows.example'):
        return kind == 'file'  # Public, tracked templates in the fixed official SDK.
    for part in parts:
        lower = part.lower()
        if lower in ('.npmrc', '.yarnrc', '.netrc', '.ssh', '.aws', '.context', '__pycache__') or lower == '.env' or lower.startswith('.env.'):
            return False
        if re.search(r'\.(?:duckdb|sqlite|sqlite3|wal|log)(?:$|[-.])', lower):
            return False
    return True


def validate_manifest(manifest, identity):
    keys(manifest, [*identity, 'schema', 'entries'])
    need(manifest['schema'] == SCHEMA, 'SCHEMA')
    need(all(type(manifest[k]) is type(v) and manifest[k] == v for k, v in identity.items()), 'IDENTITY')
    entries = manifest['entries']
    need(type(entries) is dict and 0 < len(entries) <= MAX_ENTRIES, 'ENTRY_LIMIT')
    seen = set()
    total = 0
    for name, row in entries.items():
        parts = path_parts(name)
        folded = unicodedata.normalize('NFC', name).casefold()
        need(folded not in seen, 'PATH_COLLISION')
        seen.add(folded)
        need(type(row) is dict and row.get('kind') in ('dir', 'file', 'link'), 'ENTRY')
        kind = row['kind']
        keys(row, {'dir': ['kind'], 'file': ['kind', 'bytes', 'sha256', 'mode'], 'link': ['kind', 'target']}[kind])
        need(permitted(name, kind), 'DENY_PATH')
        for index in range(1, len(parts)):
            need(entries.get('/'.join(parts[:index])) == {'kind': 'dir'}, 'PARENT')
        if kind == 'file':
            need(type(row['bytes']) is int and 0 <= row['bytes'] <= MAX_BYTES, 'SIZE')
            need(isinstance(row['sha256'], str) and HEX.fullmatch(row['sha256']), 'DIGEST')
            need(type(row['mode']) is int and row['mode'] in (0o644, 0o755), 'MODE')
            total += row['bytes']
            need(total <= MAX_BYTES, 'SIZE_LIMIT')
        elif kind == 'link':
            target = row['target']
            need(isinstance(target, str) and 0 < len(target) <= 2048 and not target.startswith('/'), 'LINK')
            need(not any(ord(c) < 32 or ord(c) == 127 or c in '\\:' for c in target), 'LINK')
    need(all(entries.get(root) == {'kind': 'dir'} for root in ROOTS), 'ROOTS')

    def resolve_virtual(name, depth=0):
        need(depth < 64, 'LINK_CYCLE')
        parts = path_parts(name)
        for index in range(1, len(parts) + 1):
            prefix = '/'.join(parts[:index])
            row = entries.get(prefix)
            need(row is not None, 'LINK_TARGET')
            if row['kind'] == 'link':
                target = posixpath.normpath(posixpath.join(posixpath.dirname(prefix), row['target'], *parts[index:]))
                return resolve_virtual(target, depth + 1)
            need(index == len(parts) or row['kind'] == 'dir', 'LINK_PARENT')
        return name

    for name, row in entries.items():
        if row['kind'] == 'link':
            resolve_virtual(name)
    return total


def fresh_path(value):
    path = pathlib.Path(value)
    need(path.is_absolute() and path.name not in ('', '.', '..'), 'ABSOLUTE_PATH')
    parent = path.parent.resolve(strict=True)
    path = parent / path.name
    need(not os.path.lexists(path), 'DESTINATION_EXISTS')
    return path


def node_environment(node):
    return {'PATH': str(node.parent) + ':/usr/bin:/bin', 'LANG': 'C.UTF-8',
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null',
            'GIT_NO_REPLACE_OBJECTS': '1', 'GIT_OPTIONAL_LOCKS': '0', 'GIT_TERMINAL_PROMPT': '0'}


def current_identity(node):
    need(node.is_absolute() and node.is_file(), 'NODE')
    result = subprocess.run([str(node), '-e', 'console.log(JSON.stringify({platform:process.platform,arch:process.arch,node_major:Number(process.versions.node.split(".")[0])}))'],
                            cwd=KIT, env=node_environment(node), capture_output=True, timeout=15, check=True)
    machine = json_load(result.stdout)
    pin_bytes = (KIT / 'toolchain.json').read_bytes()
    pin = json_load(pin_bytes)
    need(machine['platform'] in ('darwin', 'linux') and machine['node_major'] == pin['node_major'], 'PLATFORM')
    return {**machine, 'pin_sha256': hashlib.sha256(pin_bytes).hexdigest(), 'upstream_sha': pin['upstream_sha'],
            'kit_version': json_load((KIT / 'package.json').read_bytes())['version']}


def check_inputs(root, node):
    result = subprocess.run([str(node), str(KIT / 'check.mjs'), '--upstream', str(root / 'upstream'), '--build-tools', str(root / 'build-tools')],
                            cwd=root, env=node_environment(node), capture_output=True, timeout=90)
    need(result.returncode == 0 and json_load(result.stdout).get('status') == 'READY', 'INPUTS_BLOCKED')


def check_preparation(source, identity):
    # Pin the origin of the prepared tree as well as the current packing host.
    # This is a local recipe record, not a signed build attestation.
    with open_regular(source / 'preparation.json') as f:
        data = f.read(1024 * 1024 + 1)
    need(len(data) <= 1024 * 1024, 'PREPARATION_LIMIT')
    prepared = json_load(data)
    need(type(prepared) is dict and prepared.get('schema_version') == 'shinemage-kit-preparation/v1'
         and prepared.get('status') == 'READY' and prepared.get('scope') == 'development-sdk-only', 'PREPARATION')
    need(all(prepared.get(k) == identity[k] for k in ('platform', 'arch', 'pin_sha256', 'upstream_sha')), 'PREPARATION_IDENTITY')


def inventory(source):
    entries = {}
    omitted = []
    total = 0

    def walk(path, name):
        nonlocal total
        info = path.lstat()
        kind = 'link' if stat.S_ISLNK(info.st_mode) else 'dir' if stat.S_ISDIR(info.st_mode) else 'file' if stat.S_ISREG(info.st_mode) else 'special'
        need(kind != 'special', 'SPECIAL_FILE')
        if not permitted(name, kind):
            omitted.append(name)
            return
        need(not (info.st_mode & 0o6000), 'MODE')
        need(len(entries) < MAX_ENTRIES, 'ENTRY_LIMIT')
        if kind == 'dir':
            entries[name] = {'kind': kind}
            for child in sorted(path.iterdir()):
                walk(child, name + '/' + child.name)
        elif kind == 'link':
            entries[name] = {'kind': kind, 'target': os.readlink(path)}
        else:
            total += info.st_size
            need(total <= MAX_BYTES, 'SIZE_LIMIT')
            with open_regular(path) as f:
                content_hash = digest(f)
            entries[name] = {'kind': kind, 'bytes': info.st_size, 'sha256': content_hash,
                             'mode': 0o755 if info.st_mode & 0o111 else 0o644}

    for part in ROOTS:
        need((source / part).is_dir() and not (source / part).is_symlink(), 'SOURCE_ROOT')
        walk(source / part, part)
    # Git discovery requires refs even in a detached, shallow SDK checkout.
    entries.setdefault('upstream/.git/refs', {'kind': 'dir'})
    return entries, omitted


def open_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise Invalid('KIT_ARCHIVE_SPECIAL_FILE')
    return os.fdopen(fd, 'rb')


def write_archive(source, archive, identity):
    entries, omitted = inventory(source)
    manifest = {**identity, 'schema': SCHEMA, 'entries': entries}
    size = validate_manifest(manifest, identity)
    data = canonical(manifest)
    need(len(data) <= MAX_MANIFEST, 'MANIFEST_LIMIT')
    emitted = set()
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as z:
        z.writestr('manifest.json', data)
        for name, row in entries.items():
            if row['kind'] != 'file' or row['sha256'] in emitted:
                continue
            h = hashlib.sha256()
            count = 0
            with open_regular(source / name) as f, z.open('blobs/' + row['sha256'], 'w', force_zip64=True) as output:
                while chunk := f.read(1024 * 1024):
                    count += len(chunk)
                    need(count <= row['bytes'], 'SOURCE_CHANGED')
                    h.update(chunk)
                    output.write(chunk)
            need(count == row['bytes'] and h.hexdigest() == row['sha256'], 'SOURCE_CHANGED')
            emitted.add(row['sha256'])
    need(archive.stat().st_size <= MAX_BYTES, 'ARCHIVE_SIZE_LIMIT')
    return {'entries': len(entries), 'logical_bytes': size, 'blobs': len(emitted),
            'omitted_paths': omitted, 'manifest_sha256': hashlib.sha256(data).hexdigest()}


def check_zip_directory(stream):
    """Bound central-directory allocation before ZipFile parses attacker metadata.

    Our transport has no archive comment, volumes or extensible ZIP64 records.
    Keep this strict format instead of accepting every general-purpose ZIP.
    """
    stream.seek(0, os.SEEK_END)
    end = stream.tell()
    need(end >= 22, 'ZIP_DIRECTORY')
    stream.seek(end - 22)
    magic, disk, directory_disk, on_disk, count, size, offset, comment = struct.unpack('<4s4H2IH', stream.read(22))
    need(magic == b'PK\x05\x06' and disk == directory_disk == comment == 0 and on_disk == count, 'ZIP_DIRECTORY')
    directory_end = end - 22
    if count == 65535 or size == 0xffffffff or offset == 0xffffffff:
        need(end >= 98, 'ZIP_DIRECTORY')
        stream.seek(end - 42)
        marker, disk, record_offset, disks = struct.unpack('<4sIQI', stream.read(20))
        need(marker == b'PK\x06\x07' and disk == 0 and disks == 1 and record_offset + 56 == end - 42, 'ZIP_DIRECTORY')
        stream.seek(record_offset)
        values = struct.unpack('<4sQ2H2I4Q', stream.read(56))
        marker, length, _, _, disk, directory_disk, on_disk, count, size, offset = values
        need(marker == b'PK\x06\x06' and length == 44 and disk == directory_disk == 0 and on_disk == count, 'ZIP_DIRECTORY')
        directory_end = record_offset
    need(count <= MAX_ENTRIES + 1 and size <= MAX_DIRECTORY and offset + size == directory_end, 'ZIP_DIRECTORY_LIMIT')
    stream.seek(0)


@contextmanager
def verified_archive(archive, expected_sha, identity):
    need(isinstance(expected_sha, str) and HEX.fullmatch(expected_sha), 'DIGEST')
    with open_regular(archive) as f:
        need(os.fstat(f.fileno()).st_size <= MAX_BYTES, 'ARCHIVE_SIZE_LIMIT')
        need(digest(f) == expected_sha, 'ARCHIVE_DIGEST')
        check_zip_directory(f)
        with zipfile.ZipFile(f) as z:
            infos = z.infolist()
            need(len(infos) <= MAX_ENTRIES + 1, 'ENTRY_LIMIT')
            names = [i.filename for i in infos]
            need(len(names) == len(set(names)) and 'manifest.json' in names, 'ARCHIVE_MEMBERS')
            for info in infos:
                need(info.orig_filename == info.filename, 'ARCHIVE_MEMBERS')
                need(info.filename == 'manifest.json' or re.fullmatch(r'blobs/[a-f0-9]{64}', info.filename), 'ARCHIVE_MEMBERS')
                mode = info.external_attr >> 16
                need(stat.S_IFMT(mode) in (0, stat.S_IFREG) and not mode & 0o6000, 'ARCHIVE_TYPE')
                need(not info.flag_bits & 1 and info.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'ARCHIVE_TYPE')
            need(z.getinfo('manifest.json').file_size <= MAX_MANIFEST, 'MANIFEST_LIMIT')
            manifest = json_load(z.read('manifest.json'))
            validate_manifest(manifest, identity)
            entries = manifest['entries']
            blobs = {r['sha256']: r['bytes'] for r in entries.values() if r['kind'] == 'file'}
            need(set(names) == {'manifest.json', *('blobs/' + sha for sha in blobs)}, 'ARCHIVE_MEMBERS')
            need(all(z.getinfo('blobs/' + sha).file_size == count for sha, count in blobs.items()), 'BLOB_SIZE')
            yield z, manifest
        f.seek(0)
        need(digest(f) == expected_sha, 'ARCHIVE_CHANGED')


def restore_archive(archive, expected_sha, stage, identity):
    with verified_archive(archive, expected_sha, identity) as (z, manifest):
        entries = manifest['entries']
        for name, row in sorted(entries.items(), key=lambda item: (item[0].count('/'), item[0])):
            target = stage / name
            if row['kind'] == 'dir':
                target.mkdir(mode=0o700)
            elif row['kind'] == 'file':
                h = hashlib.sha256()
                count = 0
                with z.open('blobs/' + row['sha256']) as data, target.open('xb') as output:
                    while chunk := data.read(1024 * 1024):
                        count += len(chunk)
                        need(count <= row['bytes'], 'BLOB_SIZE')
                        h.update(chunk)
                        output.write(chunk)
                need(count == row['bytes'] and h.hexdigest() == row['sha256'], 'BLOB_DIGEST')
                target.chmod(row['mode'])
        # No file is written through a link: all parents were checked as dirs.
        for name, row in entries.items():
            if row['kind'] == 'link':
                (stage / name).symlink_to(row['target'])
        for name, row in entries.items():
            if row['kind'] == 'link':
                resolved = (stage / name).resolve(strict=True)
                need(stage in resolved.parents, 'LINK_ESCAPE')

    return {'entries': len(entries), 'logical_bytes': sum(row.get('bytes', 0) for row in entries.values())}


def inspect_archive(archive, expected_sha, identity):
    """Read-only content verification for repository-owned distribution audits."""
    with verified_archive(archive, expected_sha, identity) as (z, manifest):
        blobs = {r['sha256'] for r in manifest['entries'].values() if r['kind'] == 'file'}
        for sha in blobs:
            with z.open('blobs/' + sha) as data:
                need(digest(data) == sha, 'BLOB_DIGEST')
    return manifest


def receipt(operation, **fields):
    return {'schema': SCHEMA, 'status': 'LOCAL_READY', 'operation': operation,
            'scope': 'development-sdk-only', 'supply_chain': 'NOT_VERIFIED',
            'secret_scan': 'NOT_RUN', 'production_runtime': 'NOT_INSTALLED', 'release_ready': False, **fields}


def run(args):
    node = pathlib.Path(args.node)
    identity = current_identity(node)
    destination = fresh_path(args.output if args.operation == 'pack' else args.destination)
    # Claim exclusively; a racing or existing path can never be replaced.
    destination.mkdir(mode=0o700)
    stage = None
    try:
        if args.operation == 'pack':
            source = pathlib.Path(args.source)
            need(source.is_absolute() and source.is_dir(), 'SOURCE')
            source = source.resolve(strict=True)
            need(source != destination and source not in destination.parents, 'OUTPUT_IN_SOURCE')
            check_preparation(source, identity)
            check_inputs(source, node)
            archive = destination / 'sdk.zip'
            summary = write_archive(source, archive, identity)
            with archive.open('rb') as f:
                sha = digest(f)
            result = receipt('pack', **identity, **summary, archive_sha256=sha, archive_bytes=archive.stat().st_size)
        else:
            # Destination is reserved but empty until verification succeeds.
            stage = pathlib.Path(tempfile.mkdtemp(prefix='.kit-sdk-', dir=destination.parent))
            summary = restore_archive(pathlib.Path(args.archive), args.sha256, stage, identity)
            check_inputs(stage, node)
            # Publish into our reserved directory; failure stays BLOCKED, never READY.
            for part in ROOTS:
                os.rename(stage / part, destination / part)
            result = receipt('receive', **identity, **summary, archive_sha256=args.sha256)
        (destination / 'receipt.json').write_bytes(canonical(result) + b'\n')
        return result
    except BaseException:
        (destination / 'receipt.json').write_bytes(canonical({'status': 'BLOCKED', 'release_ready': False}) + b'\n')
        raise
    finally:
        if stage is not None:
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    pack = sub.add_parser('pack')
    pack.add_argument('--source', required=True)
    pack.add_argument('--output', required=True)
    receive = sub.add_parser('receive')
    receive.add_argument('--archive', required=True)
    receive.add_argument('--sha256', required=True)
    receive.add_argument('--destination', required=True)
    for command in (pack, receive):
        command.add_argument('--node', required=True, help='absolute pinned Node executable')
    try:
        result = run(parser.parse_args())
    except (Invalid, OSError, ValueError, subprocess.SubprocessError, zipfile.BadZipFile, RuntimeError, struct.error, EOFError, zlib.error) as error:
        # No raw child output, paths or contents enter the diagnostic receipt.
        result = {'status': 'BLOCKED', 'code': str(error) if isinstance(error, Invalid) else 'KIT_ARCHIVE_FAILED', 'release_ready': False}
        print(json.dumps(result))
        return 2
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    sys.exit(main())
