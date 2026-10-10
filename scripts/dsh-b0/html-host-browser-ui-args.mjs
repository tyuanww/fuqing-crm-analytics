/** Argument guard for the headed HTML UI probe. It reuses the host probe parser. */
import assert from "node:assert/strict";
import { parseProbeArguments } from "./html-host-browser-inputs.mjs";

export function parseUiProbeArguments(args) {
  const options = parseProbeArguments(args);
  options.headed = options.run === true;
  options.headlessFallback = false;
  if (options.run) {
    assert.equal(options.headed, true, "HTML_UI_PROBE_HEADED_REQUIRED");
    assert.equal(options.headlessFallback, false, "HTML_UI_PROBE_NO_HEADLESS_FALLBACK");
  }
  return options;
}
