declare module 'global-agent' {
  export interface GlobalProxyAgent {
    HTTP_PROXY: string | null;
    HTTPS_PROXY: string | null;
    NO_PROXY: string | null;
  }

  export function createGlobalProxyAgent(options?: {
    environmentVariableNamespace?: string;
    forceGlobalAgent?: boolean;
    socketConnectionTimeout?: number;
  }): GlobalProxyAgent;
}
