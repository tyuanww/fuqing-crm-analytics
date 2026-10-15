import '@deepseek-ai/dsh-client-ui-slots';

/**
 * Alpha3 ui-workspace exposes RowToastProps from its client declaration, but
 * the generated declaration does not import the toast contract that declares
 * these slot keys. Keep this consumer-side merge until the pinned upstream
 * declaration exports the complete closure.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'workspace.toast': {
      kind: 'keyed';
      scope: 'root';
      owner: { dismissToast: () => void };
      keyProps: Record<string, object>;
    };
  }

  interface SlotFactoryMap {
    'workspace.toast.content': {
      scope: 'root';
      props: Record<string, unknown>;
    };
  }
}
