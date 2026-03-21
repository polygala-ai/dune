// Barrel re-export — preserves all existing imports from this module.

export {
  isSlackConnected,
  getSlackWebClient,
  isAgentTurnFromSlack,
  getAgentSlackThread,
  startSlackConnection,
  stopSlackConnection,
} from './connection.js'

export {
  sendMessageToSlack,
  sendImageToSlack,
} from './event-router.js'

export {
  syncAgentToSlack,
  unsyncAgentFromSlack,
  syncAllAgentsToSlack,
} from './agent-sync.js'

export {
  getChannelSlackLink,
  listChannelSlackLinks,
  syncChannelToSlack,
  unsyncChannelFromSlack,
  syncAllChannelsToSlack,
} from './channel-sync.js'

export {
  postApprovalRequest,
  updateApprovalMessage,
} from './approval-notify.js'
