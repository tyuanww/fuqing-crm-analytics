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

    def test_readonly_archive_inspection_reuses_validation_and_checks_every_blob(self):
        before = sorted(p.relative_to(self.root).as_posix() for p in self.root.rglob('*'))
        self.assertEqual(archive.inspect_archive(self.zip, self.sha, IDENTITY), self.manifest)
        self.assertEqual(sorted(p.relative_to(self.root).as_posix() for p in self.root.rglob('*')), before)
        row = self.manifest['entries']['upstream/module.js']
        self.blobs['blobs/' + row['sha256']] = b'x' * row['bytes']
        file, sha = self.rewrite()
        with self.assertRaisesRegex(archive.Invalid, 'BLOB_DIGEST'):
            archive.inspect_archive(file, sha, IDENTITY)

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

    def test_link_components_cannot_be_erased_by_dotdot_normalization(self):
        for target in ['missing/../module.js', '../../outside/../source/upstream/module.js']:
            with self.subTest(target=target):
                data = copy.deepcopy(self.manifest)
                data['entries']['upstream/link']['target'] = target
                with self.assertRaisesRegex(archive.Invalid, 'LINK_'):
                    archive.validate_manifest(data, IDENTITY)
        data = copy.deepcopy(self.manifest)
        data['entries'].update({
            'upstream/real': {'kind': 'dir'}, 'upstream/real/nested': {'kind': 'dir'},
            'upstream/real/file': data['entries']['upstream/module.js'],
            'upstream/alias': {'kind': 'link', 'target': 'real/nested'},
            'upstream/link': {'kind': 'link', 'target': 'alias/../file'},
        })
        archive.validate_manifest(data, IDENTITY)

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

    def test_pack_output_inside_source_is_rejected_before_any_write(self):
        import argparse
        alias = self.root / 'alias'
        alias.symlink_to(self.source, target_is_directory=True)
        before = sorted(p.relative_to(self.source).as_posix() for p in self.source.rglob('*'))
        for parent in [self.source, alias]:
            with self.subTest(alias=parent == alias):
                args = argparse.Namespace(operation='pack', node='/synthetic/node', source=str(self.source), output=str(parent / 'forbidden-output'))
                with patch.object(archive, 'current_identity', return_value=IDENTITY):
                    with self.assertRaisesRegex(archive.Invalid, 'OUTPUT_IN_SOURCE'):
                        archive.run(args)
                self.assertEqual(sorted(p.relative_to(self.source).as_posix() for p in self.source.rglob('*')), before)

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


class ClosureArchiveTest(unittest.TestCase):
    """The compact mode shares the archive parser, not implicit Git fallback."""

    def setUp(self):
        self.owner = tempfile.TemporaryDirectory(prefix='sdk-closure-transport-')
        self.addCleanup(self.owner.cleanup)
        self.root = Path(self.owner.name).resolve()
        self.source = self.root / 'source'
        entries = {}
        for name in archive.ROOTS:
            (self.source / name).mkdir(parents=True)
            entries[name] = {'kind': 'dir'}
        data = b'export const fixture = true;\n'
        for name in ['upstream/module.js', 'build-tools/shared.js']:
            (self.source / name).write_bytes(data)
            (self.source / name).chmod(0o644)
            entries[name] = {'kind': 'file', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'mode': 0o644}
        (self.source / 'upstream/link').symlink_to('module.js')
        entries['upstream/link'] = {'kind': 'link', 'target': 'module.js'}
        self.closure = {k: v for k, v in IDENTITY.items() if k != 'kit_version'}
        self.closure.update(schema=archive.CLOSURE_SCHEMA, scope='development-build-only',
                            source_archive_sha256='c' * 64, entries=entries)
        # Deliberately non-canonical JSON: transport must preserve exact bytes.
        self.data = (json.dumps(self.closure, indent=2) + '\n').encode()
        self.closure_sha = hashlib.sha256(self.data).hexdigest()
        (self.source / 'sdk-closure.json').write_bytes(self.data)
        self.file = self.root / 'sdk.zip'
        self.summary = archive.write_archive(self.source, self.file, IDENTITY, self.closure_sha)
        self.sha = hashlib.sha256(self.file.read_bytes()).hexdigest()

    def changed_archive(self, transform):
        with zipfile.ZipFile(self.file) as z:
            parts = {info.filename: z.read(info) for info in z.infolist()}
        transform(parts)
        target = self.root / 'changed.zip'
        with zipfile.ZipFile(target, 'w') as z:
            for name, data in parts.items():
                z.writestr(name, data)
        return target, hashlib.sha256(target.read_bytes()).hexdigest()

    def test_roundtrip_preserves_closure_digest_blobs_modes_and_links(self):
        stage = self.root / 'stage'
        stage.mkdir()
        result = archive.restore_archive(self.file, self.sha, stage, IDENTITY, self.closure_sha)
        self.assertEqual(result['entries'], 6)
        self.assertEqual((stage / 'sdk-closure.json').read_bytes(), self.data)
        self.assertEqual((stage / 'upstream/link').read_bytes(), (self.source / 'upstream/module.js').read_bytes())
        self.assertEqual(stat.S_IMODE((stage / 'build-tools/shared.js').stat().st_mode), 0o644)
        self.assertFalse((stage / 'upstream/.git').exists())
        self.assertEqual(self.summary['blobs'], 1)
        manifest = archive.inspect_archive(self.file, self.sha, IDENTITY, self.closure_sha)
        self.assertEqual(manifest['schema'], archive.CLOSURE_ARCHIVE_SCHEMA)
        self.assertEqual(manifest['closure_sha256'], self.closure_sha)

    def test_compact_mode_requires_both_digests_without_fallback(self):
        for outer, closure in [('0' * 64, self.closure_sha), (self.sha, '0' * 64), (self.sha, None)]:
            with self.subTest(outer=outer, closure=closure):
                with self.assertRaises(archive.Invalid):
                    archive.inspect_archive(self.file, outer, IDENTITY, closure)
        with self.assertRaisesRegex(archive.Invalid, 'CLOSURE_DIGEST'):
            archive.inspect_archive(self.file, self.sha, IDENTITY, '')

    def test_closure_bytes_cannot_be_swapped_with_a_new_outer_hash(self):
        def change(parts):
            parts['sdk-closure.json'] += b' '
        file, sha = self.changed_archive(change)
        with self.assertRaisesRegex(archive.Invalid, 'CLOSURE_DIGEST'):
            archive.inspect_archive(file, sha, IDENTITY, self.closure_sha)

    def test_outer_and_inner_file_graphs_must_agree(self):
        def change(parts):
            manifest = json.loads(parts['manifest.json'])
            manifest['entries']['upstream/link']['target'] = '../build-tools/shared.js'
            parts['manifest.json'] = archive.canonical(manifest)
        file, sha = self.changed_archive(change)
        with self.assertRaisesRegex(archive.Invalid, 'CLOSURE_ENTRIES'):
            archive.inspect_archive(file, sha, IDENTITY, self.closure_sha)

    def test_compact_identity_schema_paths_limits_and_native_zip_links_fail_closed(self):
        for field, value in [('schema', 'unknown'), ('scope', 'runtime'), ('node_major', True),
                             ('arch', 'wrong'), ('source_archive_sha256', 'bad'), ('extra', 1)]:
            with self.subTest(field=field):
                closure = copy.deepcopy(self.closure)
                closure[field] = value
                data = archive.canonical(closure)
                with self.assertRaises(archive.Invalid):
                    archive.validate_closure(data, hashlib.sha256(data).hexdigest(), IDENTITY)
        for name, row in [('upstream/.git', {'kind': 'dir'}), ('upstream/data.sqlite', {'kind': 'dir'}),
                          ('upstream/extra', {'kind': 'file', 'bytes': 65 * 1024**2, 'sha256': 'a' * 64, 'mode': 0o644})]:
            with self.subTest(name=name):
                closure = copy.deepcopy(self.closure)
                closure['entries'][name] = row
                data = archive.canonical(closure)
                with self.assertRaises(archive.Invalid):
                    archive.validate_closure(data, hashlib.sha256(data).hexdigest(), IDENTITY)
        info = zipfile.ZipInfo('sdk-closure.json')
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        def change(parts):
            del parts['sdk-closure.json']
            parts[info] = b'../../outside'
        file, sha = self.changed_archive(change)
        with self.assertRaisesRegex(archive.Invalid, 'ARCHIVE_TYPE'):
            archive.inspect_archive(file, sha, IDENTITY, self.closure_sha)

    def test_shared_parser_rejects_corrupt_blob_and_oversized_compact_manifest(self):
        def change(parts):
            key = next(name for name in parts if name.startswith('blobs/'))
            parts[key] = b'x' * len(parts[key])
        file, sha = self.changed_archive(change)
        with self.assertRaisesRegex(archive.Invalid, 'BLOB_DIGEST'):
            archive.inspect_archive(file, sha, IDENTITY, self.closure_sha)
        with patch.object(archive, 'CLOSURE_MAX_MANIFEST', 1):
            with self.assertRaisesRegex(archive.Invalid, 'CLOSURE_LIMIT'):
                archive.inspect_archive(self.file, self.sha, IDENTITY, self.closure_sha)

    def test_pack_cli_checks_source_before_and_after_and_never_infers_mode(self):
        import argparse
        target = self.root / 'pack'
        args = argparse.Namespace(operation='pack', node='/synthetic/node', source=str(self.source),
                                  output=str(target), closure_sha256=self.closure_sha)
        with patch.object(archive, 'current_identity', return_value=IDENTITY), patch.object(archive, 'check_inputs') as check:
            result = archive.run(args)
        self.assertEqual(check.call_count, 2)
        self.assertTrue(all(call.args[-1] == self.closure_sha for call in check.call_args_list))
        self.assertEqual(result['closure_sha256'], self.closure_sha)
        self.assertEqual(result['source_archive_sha256'], self.closure['source_archive_sha256'])
        self.assertFalse(result['release_ready'])
        args.output = str(self.root / 'not-inferred')
        args.closure_sha256 = None
        with patch.object(archive, 'current_identity', return_value=IDENTITY):
            with self.assertRaises(FileNotFoundError):
                archive.run(args)
        self.assertEqual(json.loads((Path(args.output) / 'receipt.json').read_text())['status'], 'BLOCKED')

    def test_receive_cli_stages_validates_and_never_overwrites(self):
        import argparse
        target = self.root / 'received'
        args = argparse.Namespace(operation='receive', node='/synthetic/node', archive=str(self.file),
                                  sha256=self.sha, destination=str(target), closure_sha256=self.closure_sha)
        with patch.object(archive, 'current_identity', return_value=IDENTITY), patch.object(archive, 'check_inputs') as check:
            result = archive.run(args)
            with self.assertRaisesRegex(archive.Invalid, 'DESTINATION_EXISTS'):
                archive.run(args)
        self.assertEqual(check.call_count, 1)
        self.assertEqual(check.call_args.args[-1], self.closure_sha)
        self.assertEqual((target / 'sdk-closure.json').read_bytes(), self.data)
        self.assertEqual(result['schema'], archive.CLOSURE_ARCHIVE_SCHEMA)
        self.assertEqual(result['secret_scan'], 'NOT_RUN')
        self.assertEqual(list(self.root.glob('.kit-sdk-*')), [])
        args.destination = str(self.root / 'blocked')
        with patch.object(archive, 'current_identity', return_value=IDENTITY), patch.object(archive, 'check_inputs', side_effect=archive.Invalid('KIT_ARCHIVE_INPUTS_BLOCKED')):
            with self.assertRaisesRegex(archive.Invalid, 'INPUTS_BLOCKED'):
                archive.run(args)
        self.assertEqual(sorted(p.name for p in Path(args.destination).iterdir()), ['receipt.json'])
        self.assertEqual(list(self.root.glob('.kit-sdk-*')), [])


if __name__ == '__main__':
    unittest.main()
