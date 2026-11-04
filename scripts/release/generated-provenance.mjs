/**
 * Compatibility entry for main-repository release callers.
 *
 * The implementation moved to `@shine-mage/dsh-plugin-kit/provenance` so that
 * independently built plugins can receipt their own build without importing a
 * main-repository script. Keep this module as a thin re-export until every
 * release caller has migrated; do not add new implementation here.
 */
export * from '../../dsh-plugins/plugin-kit/provenance.mjs';
