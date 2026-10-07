"""Isolated archive transport regressions; no SDK, registry or business data."""
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import struct
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import zlib

SCRIPT = Path(__file__).resolve().parents[2] / 'dsh-plugins/plugin-kit/sdk-archive.py'
SPEC = importlib.util.spec_from_file_location('sdk_archive', SCRIPT)
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)
IDENTITY = {'platform': 'darwin', 'arch': 'arm64', 'node_major': 24,
            'pin_sha256': 'a' * 64, 'upstream_sha': 'b' * 40, 'kit_version': '0.1.0'}


class ArchiveTest(unittest.TestCase):
    def setUp(self):
        self.owner = tempfile.TemporaryDirectory(prefix='sdk-archive-test-')
        self.addCleanup(self.owner.cleanup)
        self.root = Path(self.owner.name).resolve()
        self.source = self.root / 'source'
        for name in archive.ROOTS:
            (self.source / name).mkdir(parents=True)
        git = self.source / 'upstream/.git'
        (git / 'objects').mkdir(parents=True)
        (git / 'refs').mkdir()
        (git / 'HEAD').write_text('b' * 40 + '\n')
        (git / 'config').write_text('synthetic credential config must not ship')
        (git / 'hooks').mkdir()
        (git / 'hooks/run').write_text('synthetic executable must not ship')
        (self.source / 'upstream/module.js').write_text('export const answer = 42;\n')
        (self.source / 'upstream/tool').write_text('#!/bin/sh\nexit 0\n')
        (self.source / 'upstream/tool').chmod(0o755)
        (self.source / 'upstream/link').symlink_to('module.js')
        (self.source / 'upstream/.env').write_text('SYNTHETIC=not-for-distribution')
        (self.source / 'build-tools/shared.js').write_text('export const answer = 42;\n')
        self.zip = self.root / 'sdk.zip'
        self.summary = archive.write_archive(self.source, self.zip, IDENTITY)
        self.sha = hashlib.sha256(self.zip.read_bytes()).hexdigest()
        with zipfile.ZipFile(self.zip) as z:
            self.manifest = json.loads(z.read('manifest.json'))
            self.blobs = {i.filename: z.read(i) for i in z.infolist() if i.filename != 'manifest.json'}

    def restore(self, file=None, sha=None):
        stage = self.root / 'stage'
        stage.mkdir()
        return archive.restore_archive(file or self.zip, sha or self.sha, stage, IDENTITY)

    def rewrite(self, manifest=None, extra=None):
        target = self.root / 'modified.zip'
        with zipfile.ZipFile(target, 'w') as z:
            z.writestr('manifest.json', archive.canonical(manifest or self.manifest))
            for name, data in self.blobs.items():
                z.writestr(name, data)
            if extra:
                z.writestr(*extra)
        return target, hashlib.sha256(target.read_bytes()).hexdigest()

    def test_roundtrip_dedup_links_modes_and_excluded_configuration(self):
        self.restore()
        stage = self.root / 'stage'
        self.assertEqual((stage / 'upstream/link').read_bytes(), (self.source / 'upstream/module.js').read_bytes())
        self.assertEqual(os.readlink(stage / 'upstream/link'), 'module.js')
        self.assertEqual(stat.S_IMODE((stage / 'upstream/tool').stat().st_mode), 0o755)
        self.assertFalse((stage / 'upstream/.git/config').exists())
        self.assertFalse((stage / 'upstream/.git/hooks').exists())
        self.assertFalse((stage / 'upstream/.env').exists())
        files = [r for r in self.manifest['entries'].values() if r['kind'] == 'file']
        self.assertLess(self.summary['blobs'], len(files))
        self.assertEqual(archive.receipt('pack')['release_ready'], False)
        self.assertEqual(archive.receipt('pack')['secret_scan'], 'NOT_RUN')

    def test_outer_digest_fails_before_writes(self):
        with self.assertRaisesRegex(archive.Invalid, 'ARCHIVE_DIGEST'):
            self.restore(sha='0' * 64)
        self.assertEqual(list((self.root / 'stage').iterdir()), [])

    def test_exact_schema_pin_and_platform(self):
        for field, value in [('schema', 'unknown/v2'), ('platform', 'linux'), ('arch', 'x64'), ('node_major', True), ('pin_sha256', '0' * 64), ('surprise', 1)]:
            with self.subTest(field=field):
                data = copy.deepcopy(self.manifest)
                data[field] = value
                with self.assertRaises(archive.Invalid):
                    archive.validate_manifest(data, IDENTITY)

    def test_manifest_paths_collision_denied_names_and_parent_links(self):
        for name in ['../escape', '/absolute', 'upstream/../escape', 'upstream//double', 'upstream/back\\slash', 'upstream/a:b', 'other/file', 'upstream/.git/config', 'upstream/.git/hooks/evil', 'upstream/.env', 'upstream/data.duckdb', 'upstream/Module.js', 'upstream/link/child']:
            with self.subTest(name=name):
                data = copy.deepcopy(self.manifest)
                data['entries'][name] = {'kind': 'dir'}
                with self.assertRaises(archive.Invalid):
                    archive.validate_manifest(data, IDENTITY)

    def test_links_reject_escape_missing_cycle_and_links_to_omitted_state(self):
        for target in ['../../escape', '/etc/passwd', 'missing', 'link', '.git/config', '..\\escape']:
            with self.subTest(target=target):
                data = copy.deepcopy(self.manifest)
                data['entries']['upstream/link']['target'] = target
                with self.assertRaises(archive.Invalid):
                    archive.validate_manifest(data, IDENTITY)
        # Follow directory aliases in the virtual graph, too.
        data = copy.deepcopy(self.manifest)
        data['entries']['upstream/alias'] = {'kind': 'link', 'target': '../build-tools'}
        data['entries']['upstream/link']['target'] = 'alias/shared.js'
        archive.validate_manifest(data, IDENTITY)

    def test_special_files_and_absolute_source_links_rejected(self):
        (self.source / 'upstream/escape').symlink_to('/tmp')
        with self.assertRaisesRegex(archive.Invalid, 'LINK'):
            archive.write_archive(self.source, self.root / 'bad.zip', IDENTITY)
        (self.source / 'upstream/escape').unlink()
        os.mkfifo(self.source / 'upstream/fifo')
        with self.assertRaisesRegex(archive.Invalid, 'SPECIAL_FILE'):
            archive.inventory(self.source)

    def test_blob_digest_and_size_mismatch_fail_in_stage(self):
        manifest = copy.deepcopy(self.manifest)
        row = manifest['entries']['upstream/module.js']
        key = 'blobs/' + row['sha256']
        self.blobs[key] = b'x' * row['bytes']
        file, sha = self.rewrite(manifest)
        with self.assertRaisesRegex(archive.Invalid, 'BLOB_DIGEST'):
            self.restore(file, sha)

    def test_zip_native_link_member_and_extra_members_rejected(self):
        info = zipfile.ZipInfo('blobs/' + '0' * 64)
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        file, sha = self.rewrite(extra=(info, '../../escape'))
        with self.assertRaisesRegex(archive.Invalid, 'ARCHIVE_TYPE'):
            self.restore(file, sha)

    def test_zip_traversal_member_is_never_extracted(self):
        file, sha = self.rewrite(extra=('../escaped', 'do not extract'))
        with self.assertRaisesRegex(archive.Invalid, 'ARCHIVE_MEMBERS'):
            self.restore(file, sha)
        self.assertFalse((self.root / 'escaped').exists())

    def test_duplicate_json_and_archive_members_fail_closed(self):
        with self.assertRaisesRegex(archive.Invalid, 'JSON_DUPLICATE'):
            archive.json_load(b'{"schema":"one","schema":"two"}')
        # An extra valid-looking blob is also rejected even with a matching outer digest.
        file, sha = self.rewrite(extra=('blobs/' + '0' * 64, 'unexpected'))
        with self.assertRaisesRegex(archive.Invalid, 'ARCHIVE_MEMBERS'):
            self.restore(file, sha)

    def test_central_directory_allocation_is_bounded_before_zip_parse(self):
        data = bytearray(self.zip.read_bytes())
        # Claim a huge directory while preserving a matching reviewed outer hash.
        struct.pack_into('<I', data, len(data) - 10, archive.MAX_DIRECTORY + 1)
        file = self.root / 'huge-directory.zip'
        file.write_bytes(data)
        with self.assertRaisesRegex(archive.Invalid, 'ZIP_DIRECTORY_LIMIT'):
            self.restore(file, hashlib.sha256(data).hexdigest())

    def test_limits_and_modes(self):
        with patch.object(archive, 'MAX_BYTES', 1):
            with self.assertRaisesRegex(archive.Invalid, 'SIZE'):
                archive.validate_manifest(self.manifest, IDENTITY)
        for mode in [0o777, 0o4755, True]:
            data = copy.deepcopy(self.manifest)
            data['entries']['upstream/tool']['mode'] = mode
            with self.assertRaisesRegex(archive.Invalid, 'MODE'):
                archive.validate_manifest(data, IDENTITY)
        with patch.object(archive, 'MAX_MANIFEST', 1):
            with self.assertRaisesRegex(archive.Invalid, 'MANIFEST_LIMIT'):
                self.restore()

    def test_existing_or_dangling_destination_not_overwritten(self):
        for target in [self.source, self.root / 'dangling']:
            if not target.exists():
                target.symlink_to(self.root / 'absent')
            with self.assertRaisesRegex(archive.Invalid, 'DESTINATION_EXISTS'):
                archive.fresh_path(str(target))
        with self.assertRaisesRegex(archive.Invalid, 'ABSOLUTE_PATH'):
            archive.fresh_path('relative')

    def test_cli_failure_keeps_blocked_receipt_and_removes_owned_stage(self):
        import argparse
        target = self.root / 'received'
        args = argparse.Namespace(operation='receive', node='/synthetic/node', archive=str(self.zip), sha256=self.sha, destination=str(target))
        with patch.object(archive, 'current_identity', return_value=IDENTITY), patch.object(archive, 'check_inputs', side_effect=archive.Invalid('KIT_ARCHIVE_INPUTS_BLOCKED')):
            with self.assertRaisesRegex(archive.Invalid, 'INPUTS_BLOCKED'):
                archive.run(args)
        self.assertEqual(json.loads((target / 'receipt.json').read_text())['status'], 'BLOCKED')
        self.assertEqual(sorted(p.name for p in target.iterdir()), ['receipt.json'])
        self.assertEqual(list(self.root.glob('.kit-sdk-*')), [])

    def test_preparation_source_identity_is_checked_separately(self):
        data = {**IDENTITY, 'schema_version': 'shinemage-kit-preparation/v1', 'status': 'READY', 'scope': 'development-sdk-only'}
        file = self.source / 'preparation.json'
        file.write_bytes(archive.canonical(data))
        archive.check_preparation(self.source, IDENTITY)
        data['arch'] = 'different'
        file.write_bytes(archive.canonical(data))
        with self.assertRaisesRegex(archive.Invalid, 'PREPARATION_IDENTITY'):
            archive.check_preparation(self.source, IDENTITY)

    def test_cli_corrupt_stream_errors_are_redacted(self):
        args = ['sdk-archive.py', 'receive', '--archive', '/synthetic', '--sha256', 'a' * 64, '--destination', '/synthetic-dest', '--node', '/node']
        for error in [zlib.error('SYNTHETIC_PRIVATE_PATH'), EOFError('SYNTHETIC_PRIVATE_PATH')]:
            output = io.StringIO()
            with patch('sys.argv', args), patch('sys.stdout', output), patch.object(archive, 'run', side_effect=error):
                self.assertEqual(archive.main(), 2)
            self.assertEqual(json.loads(output.getvalue())['code'], 'KIT_ARCHIVE_FAILED')
            self.assertNotIn('SYNTHETIC_PRIVATE_PATH', output.getvalue())


if __name__ == '__main__':
    unittest.main()
