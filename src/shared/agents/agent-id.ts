// Shared agent ID helpers.

import { nanoid } from 'nanoid';

const DUNE_AGENT_CHAT_JID_PREFIX = 'dune:agent:';

/** Creates agent ID. */
export function createAgentId() {
  return nanoid(8);
}

/** Returns whether the value is a Dune agent chat jid. */
export function isDuneAgentChatJid(value: string) {
  return value.startsWith(DUNE_AGENT_CHAT_JID_PREFIX);
}

/** Converts to agent chat jid. */
export function toAgentChatJid(agentId: string) {
  return isDuneAgentChatJid(agentId)
    ? agentId
    : `${DUNE_AGENT_CHAT_JID_PREFIX}${agentId}`;
}

/** Converts to agent path ID. */
export function toAgentPathId(agentId: string) {
  return isDuneAgentChatJid(agentId)
    ? agentId.slice(DUNE_AGENT_CHAT_JID_PREFIX.length)
    : agentId;
}
