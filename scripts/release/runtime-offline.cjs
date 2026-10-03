// The pinned pnpm can probe registry policy metadata despite
// --offline. Fail before opening a socket; cache misses belong to prepare.
const { syncBuiltinESMExports } = require('node:module');
function denied() { throw new Error('RUNTIME_OFFLINE_NETWORK_DENIED run pinned pipeline --prepare'); }
for (const name of ['node:http', 'node:https']) {
  const api = require(name);
  api.request = denied;
  api.get = denied;
}
const net = require('node:net');
net.connect = denied;
net.createConnection = denied;
net.Socket.prototype.connect = denied;
require('node:tls').connect = denied;
globalThis.fetch = denied;
syncBuiltinESMExports();
