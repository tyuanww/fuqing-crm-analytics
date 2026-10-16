import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = resolve(process.argv[2] ?? 'docs/hackathon/evidence/m2-07-owner-governance-exception-20261016.json');
const document = JSON.parse(await readFile(input, 'utf8'));
const actors = document.census?.active_actors ?? [];
const roleCounts = {};
for (const actor of actors) {
  for (const role of actor.roles ?? []) roleCounts[role] = (roleCounts[role] ?? 0) + 1;
}
const summary = {
  schema_version: 'shinemage-alpha4-owner-role-census/v1',
  input,
  active_actor_count: actors.length,
  active_actors: actors.map(({ actor, roles }) => ({ actor, roles })),
  role_counts: roleCounts,
  premise: document.premise,
  observed_imbalance: actors.length === 1 ? 'SOLE_OWNER_HOLDS_ALL_LOCAL_ROLES' : 'MULTI_ACTOR',
  decision: document.decision,
  release_ready: false,
};
if (actors.length !== 1 || !['operator', 'approver', 'technical_verifier'].every(role => roleCounts[role] === 1)) {
  console.error(JSON.stringify({ ...summary, status: 'CENSUS_INVALID' }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ...summary, status: 'CENSUS_PASS_OWNER_OPERATED' }, null, 2));
}
