import { Type, Static } from '@sinclair/typebox'

export const SlackSettingsSchema = Type.Object({
  isConnected: Type.Boolean(),
  teamId: Type.Union([Type.String(), Type.Null()]),
  teamName: Type.Union([Type.String(), Type.Null()]),
  botUserId: Type.Union([Type.String(), Type.Null()]),
  installedAt: Type.Union([Type.Number(), Type.Null()]),
  hasBotToken: Type.Boolean(),
  hasAppToken: Type.Boolean(),
  approvalChannelId: Type.Union([Type.String(), Type.Null()]),
})

export type SlackSettings = Static<typeof SlackSettingsSchema>
