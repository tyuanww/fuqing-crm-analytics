export interface FirstPurchaseCommandInvocation {
  sessionId: string; commandId: string; rawInput: string; signal: AbortSignal;
  requestForCall(callId: string): string | undefined;
}
export function createFirstPurchaseCommands(options: { origin: string; sessionId: string; gatewayToken?: string; fetchImpl?: typeof fetch }): {
  dispose(): void;
  execute(name: string, invocation: FirstPurchaseCommandInvocation): Promise<{ kind: 'success' | 'error'; text: string }>;
};
