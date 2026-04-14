import type {
  Agent as AgentLiteAgent,
  AgentLite,
  ChannelDriverFactory,
  McpServerConfig,
  RegisterGroupOptions,
} from '@boxlite-ai/agentlite';

import { DuneChannel } from './dune-channel';

export interface DuneAgentOptions {
  agentLite: AgentLite;
  boundExternalJid?: string | undefined;
  credentials: () => Promise<Record<string, string>>;
  externalChannelFactory?: ChannelDriverFactory | undefined;
  groupFolder: string;
  instructions?: string | undefined;
  mcpServers?: Record<string, McpServerConfig> | undefined;
  mounts?: Array<{
    containerPath: string;
    hostPath: string;
    readonly?: boolean;
  }>;
  name: string;
  onExternalInbound?: (text: string, senderName: string) => void;
  onOutboundMessage: (chatJid: string, text: string) => void;
  primaryChatJid: string;
  skills?: string[] | undefined;
}

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

export class DuneAgent {
  private agent!: AgentLiteAgent;

  private duneChannel!: DuneChannel;

  readonly groupFolder: string;

  private readonly options: DuneAgentOptions;

  constructor(options: DuneAgentOptions) {
    this.options = options;
    this.groupFolder = options.groupFolder;
  }

  async start() {
    const { options } = this;

    const channels: Record<string, ChannelDriverFactory> = {
      dune: (config) => {
        this.duneChannel = new DuneChannel({
          boundExternalJid: options.boundExternalJid,
          config,
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

    this.agent = options.agentLite.getOrCreateAgent(options.groupFolder, {
      channels,
      credentials: options.credentials,
      ...(options.instructions ? { instructions: options.instructions } : {}),
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
    });

    await this.agent.start();
    await this.registerPrimaryGroup();
  }

  /** The underlying AgentLite agent instance for event subscriptions. */
  get agentLiteAgent(): AgentLiteAgent {
    return this.agent;
  }

  async pushUserMessage(chatJid: string, text: string, senderName: string = 'You') {
    await this.duneChannel.pushInboundMessage(chatJid, text, senderName);
  }

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
