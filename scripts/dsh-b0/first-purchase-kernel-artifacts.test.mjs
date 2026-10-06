import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { serviceDigest as hash } from '../release/service-compatibility.mjs';
import { packFirstPurchaseKernel, prepareFirstPurchaseKernel, verifyFirstPurchaseKernel } from './first-purchase-kernel-artifacts.mjs';

test('query archive requires an exact Git identity before any packaging', async () => {
  for (const revision of ['main', '43630981', '', undefined]) {
    await assert.rejects(packFirstPurchaseKernel({ revision }), /HOST_KERNEL_EXACT_SOURCE/);
  }
});

test('query installer rejects receipt substitution before extracting or executing code', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'owned-kernel-reject-'));
  try {
    const receiptPath = join(temporary, 'receipt.json');
    await writeFile(receiptPath, '{}');
    await assert.rejects(prepareFirstPurchaseKernel({ receiptPath, expectedSha: 'a'.repeat(64),
      output: join(temporary, 'unused'), python: '/unavailable/python', wheelhouse: temporary }), /HOST_KERNEL_RECEIPT_DIGEST/);
    await assert.rejects(prepareFirstPurchaseKernel({ receiptPath: 'relative', expectedSha: 'a'.repeat(64),
      output: temporary, python: '/unavailable/python', wheelhouse: temporary }), /HOST_KERNEL_ABSOLUTE_PATH/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

const receiptPath = process.env.B0_NATIVE_CRM_KERNEL_RECEIPT;
const python = process.env.B0_NATIVE_CRM_SERVICE_PYTHON;
const wheelhouse = process.env.B0_NATIVE_CRM_KERNEL_WHEELHOUSE;
test('actual query archive cold install, immutable checks, and dependency closure', {
  skip: !(receiptPath && python && wheelhouse) && 'explicit query receipt/Python/wheels required',
}, async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'owned-kernel-install-'));
  try {
    const bytes = await readFile(receiptPath), expectedSha = hash(bytes), original = JSON.parse(bytes);
    const args = { receiptPath, expectedSha, python, wheelhouse };
    const installed = await prepareFirstPurchaseKernel({ ...args, output: join(temporary, 'install') });
    assert.equal(installed.receipt.runtime_mode, 'offline-hashed-wheel-install');
    assert.equal(JSON.parse(installed.manifest).dependencies.duckdb, '1.5.6');
    await assert.rejects(prepareFirstPurchaseKernel({ ...args, output: installed.output }), /EEXIST/);
    const target = join(installed.app, 'backend/analytics_worker.py');
    await writeFile(target, '# corrupted owned test extraction\n');
    await assert.rejects(verifyFirstPurchaseKernel(installed), /HOST_SERVICE_INSTALLED_(SIZE|DIGEST)/);
    // Corrupt only a separate input copy; never touch the supplied archive/evidence.
    const bad = join(temporary, 'input');
    await mkdir(bad);
    await copyFile(join(dirname(receiptPath), 'kernel-manifest.json'), join(bad, 'kernel-manifest.json'));
    await writeFile(join(bad, 'kernel.tar.zst'), 'changed archive');
    await writeFile(join(bad, 'receipt.json'), bytes);
    await assert.rejects(prepareFirstPurchaseKernel({ ...args, receiptPath: join(bad, 'receipt.json'),
      output: join(temporary, 'never-installed') }), /HOST_KERNEL_ARCHIVE_DIGEST/);
    await copyFile(join(dirname(receiptPath), 'kernel.tar.zst'), join(bad, 'kernel.tar.zst'));
    const first = Object.values(original.wheels)[0];
    await writeFile(join(bad, first.file), 'changed wheel');
    await assert.rejects(prepareFirstPurchaseKernel({ ...args, wheelhouse: bad,
      output: join(temporary, 'bad-wheel') }), /HOST_KERNEL_WHEEL_DIGEST/);
    assert.equal(hash(await readFile(receiptPath)), expectedSha);
    assert.equal(hash(await readFile(join(dirname(receiptPath), 'kernel.tar.zst'))), original.sha256);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
