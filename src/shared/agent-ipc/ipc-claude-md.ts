/** Generate the CLAUDE.md content for an agent's IPC directory. */
export function createIpcClaudeMd(projectId: string): string {
  return `# Agent IPC Protocol

You communicate with Dune via filesystem IPC. This directory contains two subdirectories.

## Your Project ID

Your project ID is \`${projectId}\`. Use this in all board management requests.

## Directories

Inside the container, the IPC directory is mounted at \`/workspace/extra/ipc/\`.

- \`/workspace/extra/ipc/host/\` — Dune writes messages here. You read and delete them.
- \`/workspace/extra/ipc/agent/\` — You write messages here. Dune reads and deletes them.

## File Naming

All files use the format: \`{timestamp}-{randstring}.json\` (e.g. \`1712345679-def.json\`)

## Message Format

Every file is JSON with \`type\` and \`payload\`:

\`\`\`json
{ "type": "<message-type>", "payload": { ... } }
\`\`\`

## Reading Messages from Dune

Watch \`host/\` for new \`.json\` files. Read the file, process it, then delete it.

| type | payload | action |
|------|---------|--------|
| \`user-message\` | \`{ text }\` | User sent you a message. Reply to it. |
| \`board-data\` | \`{ items: [...] }\` | Response to your \`get-board\` request. |
| \`item-created\` | \`{ itemId }\` | Confirmation of your \`create-item\` request. |
| \`task-created\` | \`{ taskId }\` | Confirmation of your \`add-task\` request. |
| \`work-product-created\` | \`{ workProductId }\` | Confirmation of your \`add-work-product\` request. |
| \`ack\` | \`{ success }\` | Confirmation of an update/move operation. |

## Writing Messages to Dune

### Replying to a user message

When you receive \`host/1712345679-def.json\`, reply by writing to \`agent/1712345679-def-reply.json\`.

For streaming: overwrite the reply file as your content grows, incrementing \`seq\` each time. When done, write \`agent/1712345679-def-reply.done\` with \`{ "type": "reply-done", "payload": {} }\`.

\`\`\`json
{ "type": "reply", "payload": { "content": "full response so far", "seq": 1 } }
\`\`\`

### Sending a message (not a reply)

\`\`\`json
{ "type": "message", "payload": { "content": "your message" } }
\`\`\`

### Reporting errors

\`\`\`json
{ "type": "error", "payload": { "code": "error-code", "message": "description" } }
\`\`\`

## Request/Reply Pattern

When you send a request to Dune (like \`get-board\`, \`create-item\`, etc.), Dune writes the reply to \`host/\` using **your original filename stem + \`-reply\`**.

**Example flow:**

1. You write \`agent/1712345679-def.json\` with \`{ "type": "get-board", "payload": { "projectId": "${projectId}" } }\`
2. Dune reads your file, processes it, then writes \`host/1712345679-def-reply.json\` with the response
3. You **watch \`host/\` for the \`-reply\` file**, read it, then delete it

**You must wait for the reply.** After writing a request, poll or watch \`host/\` for a file named \`{your-filename-stem}-reply.json\`. Do not proceed until you receive the reply. Replies typically arrive within a few hundred milliseconds.

**No \`.done\` file for request replies.** The \`.done\` file is only used when **you** stream a reply to a user message (multiple overwrites). Dune's replies to your requests are single, complete writes — just read the \`-reply.json\` file and delete it.

## Board Management

You can manage the project board by writing these message types to \`agent/\`.

### Get board items

\`\`\`json
{ "type": "get-board", "payload": { "projectId": "${projectId}" } }
\`\`\`

Dune replies in \`host/\` with:

\`\`\`json
{
  "type": "board-data",
  "payload": {
    "items": [
      {
        "id": "item-abc",
        "title": "Implement login",
        "brief": "Add OAuth login flow",
        "status": "active",
        "primaryAgentId": null,
        "tasks": [
          { "id": "task-1", "title": "Design API", "status": "done", "notes": "" },
          { "id": "task-2", "title": "Write tests", "status": "todo", "notes": "" }
        ],
        "workProducts": []
      }
    ]
  }
}
\`\`\`

### Create a board item

\`\`\`json
{
  "type": "create-item",
  "payload": {
    "title": "Fix auth bug",
    "brief": "Users getting logged out randomly",
    "projectId": "${projectId}",
    "status": "inbox"
  }
}
\`\`\`

Dune replies with \`{ "type": "item-created", "payload": { "itemId": "item-xyz" } }\`.

### Update a board item

\`\`\`json
{
  "type": "update-item",
  "payload": { "itemId": "item-abc", "title": "New title", "brief": "New description" }
}
\`\`\`

Wait for reply: \`{ "type": "ack", "payload": { "success": true } }\`

### Move item to a different status

\`\`\`json
{
  "type": "move-item",
  "payload": { "itemId": "item-abc", "status": "done" }
}
\`\`\`

Status values: \`inbox\`, \`ready\`, \`active\`, \`review\`, \`done\`.

Wait for reply: \`{ "type": "ack", "payload": { "success": true } }\`

### Add a task to an item

\`\`\`json
{
  "type": "add-task",
  "payload": { "itemId": "item-abc", "title": "Write unit tests" }
}
\`\`\`

Dune replies with \`{ "type": "task-created", "payload": { "taskId": "task-xyz" } }\`.

### Update a task

\`\`\`json
{
  "type": "update-task",
  "payload": {
    "itemId": "item-abc",
    "taskId": "task-1",
    "status": "done",
    "notes": "All tests passing"
  }
}
\`\`\`

Task status values: \`todo\`, \`doing\`, \`blocked\`, \`review\`, \`done\`.

Wait for reply: \`{ "type": "ack", "payload": { "success": true } }\`

### Add a work product

\`\`\`json
{
  "type": "add-work-product",
  "payload": {
    "itemId": "item-abc",
    "title": "API Design Doc",
    "body": "# API Design\\n\\n..."
  }
}
\`\`\`

Wait for reply: \`{ "type": "work-product-created", "payload": { "workProductId": "wp-xyz" } }\`

## Rules

- Always delete files from \`/workspace/extra/ipc/host/\` after reading them.
- Never write to \`/workspace/extra/ipc/host/\` — only read from it.
- Never read from \`/workspace/extra/ipc/agent/\` after writing — Dune handles cleanup.
- Use unique filenames: \`{Date.now()}-{random 3 chars}.json\`
- For request/reply pairs, Dune writes the reply using the same filename stem with \`-reply\` suffix.
`;
}
