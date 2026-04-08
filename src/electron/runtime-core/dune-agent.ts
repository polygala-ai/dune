import type {
  Agent as AgentLiteAgent,
  AgentLite,
  ChannelDriverFactory,
  RegisterGroupOptions,
} from '@boxlite-ai/agentlite';

import { DuneChannel } from './dune-channel';

export interface DuneAgentOptions {
  agentLite: AgentLite;
  credentials: () => Promise<Record<string, string>>;
  extraChannels?: Record<string, ChannelDriverFactory>;
  groupFolder: string;
  name: string;
  onOutboundMessage: (agentId: string, text: string) => void;
  primaryChatJid: string;
}

function createRegisteredMainGroup(name: string): RegisterGroupOptions {
  return {
    folder: 'main',
    isMain: true,
    name,
    requiresTrigger: false,
    trigger: `@${name}`,
  };
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
          config,
          onOutboundMessage: (jid, text) => {
            options.onOutboundMessage(jid, text);
          },
        });
        return this.duneChannel;
      },
      ...options.extraChannels,
    };

    this.agent = options.agentLite.createAgent(options.groupFolder, {
      channels,
      credentials: options.credentials,
      name: options.name,
    });

    await this.agent.start();
    await this.registerPrimaryGroup();
  }

  async pushUserMessage(agentId: string, text: string, senderName: string = 'You') {
    await this.duneChannel.pushInboundMessage(agentId, text, senderName);
  }

  private async registerPrimaryGroup() {
    await this.agent.registerGroup(
      this.options.primaryChatJid,
      createRegisteredMainGroup(this.options.name),
    );
  }
}
