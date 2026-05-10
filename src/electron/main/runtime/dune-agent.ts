// Desktop Dune agent wrapper.

import type {
  Agent as AgentLiteAgent,
  AgentBackendOptions,
  AgentLite,
  ChannelDriverFactory,
  McpServerConfig,
  RegisterGroupOptions,
} from '@boxlite-ai/agentlite';

import { DuneChannel } from './dune-channel';

/** ACP peer config understood by newer AgentLite runtimes. */
export interface DuneAcpPeerConfig {
  args: string[];
  command: string;
  description?: string;
  env?: Record<string, string>;
  name: string;
}

/** ACP config understood by newer AgentLite runtimes. */
export interface DuneAcpOptions {
  peers?: DuneAcpPeerConfig[];
}

/** Dune agent options. */
export interface DuneAgentOptions {
  agentLite: AgentLite;
  backend?: AgentBackendOptions | undefined;
  boundExternalJid?: string | undefined;
  credentials: () => Promise<Record<string, string>>;
  decorateOutboundMessage?: (chatJid: string, text: string) => Promise<string> | string;
  externalChannelFactory?: ChannelDriverFactory | undefined;
  groupFolder: string;
  instructions?: string | undefined;
  acp?: DuneAcpOptions | undefined;
  mcpServers?: Record<string, McpServerConfig> | undefined;
  mounts?: Array<{
    containerPath: string;
    hostPath: string;
    readonly?: boolean;
  }>;
  name: string;
  onExternalInbound?: (text: string, senderName: string, attachments?: string[]) => void;
  onOutboundMessage: (chatJid: string, text: string) => void;
  primaryChatJid: string;
  /**
   * Called immediately after `agentLite.getOrCreateAgent(...)` returns, with
   * the underlying AgentLite agent. Used to register custom actions before
   * `agent.start()` opens the actions HTTP server.
   */
  registerActions?: ((agent: AgentLiteAgent) => void) | undefined;
  skills?: string[] | undefined;
}

/** Creates registered main group. */
function createRegisteredMainGroup(
  name: string,
  mounts: NonNullable<DuneAgentOptions['mounts']> = [],
): RegisterGroupOptions {
  const options: RegisterGroupOptions = {
    folder: 'main',
    isMain: true,
    name,
    requiresTrigger: false,
    trigger: `@${name}`,
  };

  if (mounts.length > 0) {
    options.containerConfig = {
      additionalMounts: mounts.map((mount) => ({
        containerPath: mount.containerPath,
        hostPath: mount.hostPath,
        readonly: mount.readonly ?? false,
      })),
    };
  }

  return options;
}

/** Dune agent. */
export class DuneAgent {
  private agent!: AgentLiteAgent;

  private duneChannel!: DuneChannel;

  readonly groupFolder: string;

  private readonly options: DuneAgentOptions;

  constructor(options: DuneAgentOptions) {
    this.options = options;
    this.groupFolder = options.groupFolder;
  }

  /** Starts Dune agent. */
  async start() {
    const { options } = this;

    const channels: Record<string, ChannelDriverFactory> = {
      dune: (config) => {
        this.duneChannel = new DuneChannel({
          boundExternalJid: options.boundExternalJid,
          config,
          decorateOutboundMessage: options.decorateOutboundMessage,
          externalChannelFactory: options.externalChannelFactory,
          onExternalInbound: options.onExternalInbound,
          onOutboundMessage: (jid, text) => {
            options.onOutboundMessage(jid, text);
          },
          primaryJid: options.primaryChatJid,
        });
        return this.duneChannel;
      },
    };
    const mounts = options.mounts ?? [];

    const agentOptions = {
      channels,
      credentials: options.credentials,
      ...(options.instructions ? { instructions: options.instructions } : {}),
      ...(options.acp ? { acp: options.acp } : {}),
      ...(options.mcpServers ? { mcpServers: options.mcpServers } : {}),
      ...(mounts.length > 0 ? {
        mountAllowlist: {
          allowedRoots: mounts.map((mount) => ({
            allowReadWrite: !mount.readonly,
            path: mount.hostPath,
          })),
          blockedPatterns: [],
          nonMainReadOnly: false,
        },
      } : {}),
      name: options.name,
      ...(options.skills && options.skills.length > 0 ? { skills: options.skills } : {}),
    } as Parameters<AgentLite['getOrCreateAgent']>[1];

    this.agent = options.agentLite.getOrCreateAgent(options.groupFolder, agentOptions);

    if (options.backend) {
      await this.agent.setBackend(options.backend, { context: 'fresh' });
    }

    if (options.registerActions) {
      options.registerActions(this.agent);
    }

    await this.agent.start();
    await this.registerPrimaryGroup();
  }

  /** The underlying AgentLite agent instance for event subscriptions. */
  get agentLiteAgent(): AgentLiteAgent {
    return this.agent;
  }

  /** Applies backend/model options for future turns. */
  async setBackend(
    backend: AgentBackendOptions,
    options?: Parameters<AgentLiteAgent['setBackend']>[1],
  ) {
    await this.agent.setBackend(backend, options);
  }

  /** Pushes user message. */
  async pushUserMessage(chatJid: string, text: string, senderName: string = 'You') {
    await this.duneChannel.pushInboundMessage(chatJid, text, senderName);
  }

  /** Pushes control message. */
  async pushControlMessage(
    chatJid: string,
    text: string,
    senderName: string = 'Dune Control',
  ) {
    await this.duneChannel.pushInboundMessage(chatJid, text, senderName);
  }

  /** Attach an external channel to a running agent (hot-plug). */
  async attachExternalChannel(factory: ChannelDriverFactory, boundJid: string) {
    await this.duneChannel.attachExternalChannel(factory, boundJid);
  }

  /** Detaches external channel. */
  async detachExternalChannel() {
    await this.duneChannel.detachExternalChannel();
  }

  private async registerPrimaryGroup() {
    await this.agent.registerGroup(
      this.options.primaryChatJid,
      createRegisteredMainGroup(this.options.name, this.options.mounts),
    );
  }
}
