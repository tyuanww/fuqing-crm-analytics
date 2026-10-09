/** Workspace-mode save acceptance. Loads the real browser controller only when this module is imported. */
import assert from 'node:assert/strict';
import { createSaveController } from '../../dsh-plugins/analytics-workbench/src/first-purchase-save-client.mjs';
import { firstPurchaseCommandEnvelope } from '../../dsh-plugins/analytics-workbench/src/first-purchase-command-client.mjs';

export { createSaveController, firstPurchaseCommandEnvelope };

export async function runWorkspaceSaveAcceptance({ target, storage, request, title, controllers }) {
  let writes = 0, original;
  const wrapped = async (...args) => {
    const value = await request(...args);
    if (args[1] === 'save') {
      writes += 1; original = args[2];
      assert.equal(value.value.status, 'SAVED');
      throw Error('controlled ACK loss');
    }
    return value;
  };
  const first = createSaveController({ target, storage, request: wrapped, onChange() {} });
  controllers.push(first);
  await first.start();
  assert.equal(first.getState().phase, 'ready');
  assert.equal(first.getState().result.provenance.permission_scope.owner_id, 'crm-owner');
  await first.save(title);
  assert.equal(first.getState().phase, 'unknown');
  first.dispose();
  const reopened = createSaveController({ target, storage, request: wrapped, onChange() {} });
  controllers.push(reopened);
  await reopened.start();
  assert.equal(reopened.getState().phase, 'saved');
  assert.equal(writes, 1);
  assert.deepEqual((await request(target, 'save', original)).value, reopened.getState().receipt);
  const receipt = reopened.getState().receipt;
  return { writes, replay: async () => assert.deepEqual((await request(target, 'save', original)).value, receipt) };
}
