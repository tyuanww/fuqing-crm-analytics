/** Real pinned Connection + session/tool runtime + owned loopback server. */
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mountLoginHost as mountVerifiedHost } from '../../../scripts/crm-calibration/test-support/login-native.fixture.mjs';

export async function mountLoginHost(t, baseUrl) {
  const upstream = process.env.B0_BUILD_UPSTREAM;
  if (!upstream) throw new Error('B0_BUILD_UPSTREAM is required for legacy package tests');
  const load = path => import(pathToFileURL(join(upstream, path, 'lib/index.js')).href);
  const { Context } = await load('vendor/cordis');
  const { mountAgentLoopTestDependencies } = await load('packages/test-support/agent-loop-testkit');
  const connection = await load('packages/client/connection');
  const plugin = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const hostPlugin = await import(pathToFileURL(join(plugin, 'lib/host.js')).href);
  const toolsPlugin = await import(pathToFileURL(join(plugin, 'lib/index.js')).href);
  return mountVerifiedHost(t, baseUrl, { Context, mountAgentLoopTestDependencies, connection, crmHost: hostPlugin, crm: toolsPlugin });
}
