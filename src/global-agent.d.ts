// Ambient globals for the bundled agent runtime.

declare module 'global-agent' {
  /** Global proxy agent contract. */
  export interface GlobalProxyAgent {
    HTTP_PROXY: string | null;
    HTTPS_PROXY: string | null;
    NO_PROXY: string | null;
  }

  /** Creates global proxy agent. */
  export function createGlobalProxyAgent(options?: {
    environmentVariableNamespace?: string;
    forceGlobalAgent?: boolean;
    socketConnectionTimeout?: number;
  }): GlobalProxyAgent;
}
