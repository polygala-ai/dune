import { nanoid } from 'nanoid';

const DUNE_AGENT_CHAT_JID_PREFIX = 'dune:agent:';

export function createAgentId() {
  return nanoid(8);
}

export function isDuneAgentChatJid(value: string) {
  return value.startsWith(DUNE_AGENT_CHAT_JID_PREFIX);
}

export function toAgentChatJid(agentId: string) {
  return isDuneAgentChatJid(agentId)
    ? agentId
    : `${DUNE_AGENT_CHAT_JID_PREFIX}${agentId}`;
}

export function toAgentPathId(agentId: string) {
  return isDuneAgentChatJid(agentId)
    ? agentId.slice(DUNE_AGENT_CHAT_JID_PREFIX.length)
    : agentId;
}
