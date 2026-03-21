/** Shared types for agent message delivery — foundation for future unification. */

export type DeliverySource = 'dm' | 'channel' | 'mailbox' | 'slack' | 'app_action' | 'system'

export type DeliveryResult = {
  response: string
  stored: boolean
  delivered: boolean
}
