#!/usr/bin/env bash
# Compatibility command: validate the single source; never copy/overwrite it.
set -euo pipefail
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != "--check" ]; }; then
    echo "Usage: bash scripts/sync-agents.sh [--check]" >&2
    exit 2
fi
RULE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ ! -s "$RULE_ROOT/AGENTS.md" ]; then
    echo "AGENTS.md is missing or empty; restore the authoritative rules explicitly." >&2
    exit 1
fi
if [ ! -f "$RULE_ROOT/CLAUDE.md" ] || ! cmp -s "$RULE_ROOT/CLAUDE.md" <(printf '%s\n' '@AGENTS.md'); then
    echo "CLAUDE.md must contain only @AGENTS.md; review the diff before editing it." >&2
    exit 1
fi
REGEN_CLAUDE="$RULE_ROOT/.claude/skills/regen-types/SKILL.md"
REGEN_AGENTS="$RULE_ROOT/.agents/skills/regen-types/SKILL.md"
if [ -f "$REGEN_AGENTS" ] && ! cmp -s "$REGEN_CLAUDE" "$REGEN_AGENTS"; then
    echo "regen-types skill mirrors differ; update .claude and .agents together." >&2
    exit 1
fi
echo "PASS: AGENTS.md is authoritative; CLAUDE.md is an import-only entry. No files changed."
