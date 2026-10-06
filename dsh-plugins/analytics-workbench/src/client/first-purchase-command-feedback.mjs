/** rc2 blank sessions do not render command history yet. Use its public notice seam. */
export function applyFirstPurchaseCommandFeedback(ctx) {
  ctx.inject?.(['conversation', 'sessions'], scoped => {
    scoped.on('command/executed', (sessionId, name, result) => {
      if (!['first-purchase', 'first-purchase-status', 'first-purchase-cancel'].includes(name)
        || !['success', 'error'].includes(result?.kind) || typeof result.text !== 'string'
        || !result.text || result.text.length > 2400) return;
      const scope = scoped.sessions.scope(sessionId);
      if (scope) scoped.conversation.input.for(scope).notify(result.kind === 'error' ? 'error' : 'info', result.text);
    });
  });
}
