#!/usr/bin/env node
import { launchInstalledProfile, stopInstalledProfile } from './start-installed-profile-core.mjs';

const profile = await launchInstalledProfile();
const { child } = profile;
let stopping = false;

async function terminate(signal, fallbackCode) {
  if (stopping) return;
  stopping = true;
  try {
    await stopInstalledProfile(profile, signal);
    process.exit(fallbackCode);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => void terminate(signal, 0));
}
child.once('exit', code => void terminate('SIGTERM', code ?? 1));
child.once('error', error => {
  console.error(error);
  void terminate('SIGTERM', 1);
});
