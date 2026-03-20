---
name: dune-slack-connector
description: Connect Dune workspace to Slack and sync agents to channels.
---

# Dune Slack Connector

Connect the Dune workspace to a Slack workspace so agents can send and receive messages via Slack channels.

## Workflow

### First-time setup (if not already connected)

1. Check current status: `scripts/slack-status.sh`
2. If not connected, guide the user through creating a Slack app:
   - Tell them to visit https://api.slack.com/apps and click **Create New App → From a manifest**
   - Provide the YAML manifest below for them to paste
   - Ask them to copy the **Bot User OAuth Token** (starts with `xoxb-`) from **OAuth & Permissions**
   - Ask them to copy the **App-Level Token** (starts with `xapp-`) from **Basic Information → App-Level Tokens** (create one with `connections:write` scope)
3. Once the user provides both tokens, connect: `scripts/slack-connect.sh "<botToken>" "<appToken>"`
4. Verify connection: `scripts/slack-status.sh`

### Syncing agents to Slack channels

5. Sync an agent: `scripts/slack-sync-agent.sh <agentId>`
   - This creates a `dune-<agent-name>` channel in Slack automatically
   - Messages in that Slack channel are routed to the agent
   - Agent responses are posted back to the Slack channel
6. To remove an agent from Slack: `scripts/slack-unsync-agent.sh <agentId>`

### Sending messages to Slack

Once an agent is synced, it can send messages directly to its Slack channel:

- Send text: `scripts/slack-send-message.sh "<text>"`
- Send an image: `scripts/slack-send-image.sh <filepath> [alt-text]`

Both scripts default to the calling agent's synced channel. Pass an optional Slack channel ID as the last argument to target a different channel.

### Disconnecting

7. To fully disconnect: `scripts/slack-disconnect.sh`

## Slack App Manifest

Provide this manifest when guiding the user through app creation:

```yaml
display_information:
  name: Dune Agent Hub
  description: Bridge between Dune agent workspace and Slack
  background_color: "#1a1a2e"
features:
  bot_user:
    display_name: Dune
    always_online: true
oauth_config:
  scopes:
    bot:
      - channels:history
      - channels:manage
      - channels:read
      - chat:write
      - files:write
      - users:read
      - app_mentions:read
settings:
  event_subscriptions:
    bot_events:
      - app_mention
      - message.channels
  interactivity:
    is_enabled: false
  org_deploy_enabled: false
  socket_mode_enabled: true
  token_rotation_enabled: false
```

## Scripts
- `scripts/slack-status.sh` — check Slack connection status
- `scripts/slack-connect.sh` — save tokens and connect to Slack
- `scripts/slack-disconnect.sh` — disconnect and clear Slack credentials
- `scripts/slack-sync-agent.sh` — sync an agent to a new Slack channel
- `scripts/slack-unsync-agent.sh` — unsync an agent from its Slack channel
- `scripts/slack-send-message.sh` — send a text message to Slack
- `scripts/slack-send-image.sh` — upload and send an image to Slack
