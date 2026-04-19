// Conversation export helpers.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  AgentAttachment,
  AgentMessage,
} from '@/renderer/features/agents/types';

const FILE_URL_PATTERN = /file:\/\/[^\s)]+/g;
const WORKSPACE_ATTACHMENT_PATH_PATTERN = /\/workspace\/group\/attachments\/[^)\s]+/g;

interface ExportConversationMessage {
  actor: string;
  actorId: string;
  attachments: AgentAttachment[];
  content: string;
  id: string;
  role: AgentMessage['role'];
  timestamp: string;
}

interface ConversationExportPayload {
  exportedAt: string;
  groupId: string;
  groupName: string;
  messages: ExportConversationMessage[];
}

/** Returns the actor label for a message. */
function getMessageActor(
  groupId: string,
  groupName: string,
  role: AgentMessage['role'],
) {
  switch (role) {
    case 'assistant':
      return {
        actor: groupName,
        actorId: groupId,
      };
    case 'user':
      return {
        actor: 'You',
        actorId: 'user',
      };
    case 'system':
    default:
      return {
        actor: 'System',
        actorId: 'system',
      };
  }
}

/** Returns the local source path for an attachment URL when available. */
function toLocalSourcePath(source: string) {
  const trimmedSource = source.trim();

  if (!trimmedSource) {
    return null;
  }

  if (trimmedSource.startsWith('file://')) {
    return fileURLToPath(trimmedSource);
  }

  if (path.isAbsolute(trimmedSource)) {
    return trimmedSource;
  }

  return null;
}

/** Returns a unique asset filename for the export folder. */
function createUniqueAssetName(
  filename: string,
  usedNames: Set<string>,
) {
  const parsed = path.parse(filename || 'attachment');
  const baseName = parsed.name.trim() || 'attachment';
  const extension = parsed.ext || '';
  let candidate = `${baseName}${extension}`;
  let suffix = 2;

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}-${suffix}${extension}`;
    suffix += 1;
  }

  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/** Replaces asset URLs in message content. */
function rewriteContentAssetPaths(
  content: string,
  rewrites: ReadonlyMap<string, string>,
) {
  let nextContent = content;

  for (const [source, target] of rewrites) {
    nextContent = nextContent.split(source).join(target);
  }

  return nextContent;
}

/** Copies assets into the export folder and rewrites message references. */
export async function copyAssetsAndRewritePaths(
  messages: AgentMessage[],
  exportDirectoryPath: string,
) {
  const assetsDirectoryPath = path.join(exportDirectoryPath, 'assets');
  const copiedAssetPaths = new Map<string, string>();
  const usedAssetNames = new Set<string>();
  let didCreateAssetsDirectory = false;
  let didLoadExistingAssetNames = false;

  const loadExistingAssetNames = async () => {
    if (didLoadExistingAssetNames) {
      return;
    }

    didLoadExistingAssetNames = true;

    try {
      const existingAssetNames = await fs.readdir(assetsDirectoryPath);

      for (const assetName of existingAssetNames) {
        usedAssetNames.add(assetName.toLowerCase());
      }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : '';

      if (code !== 'ENOENT') {
        throw error;
      }
    }
  };

  const ensureCopiedAsset = async (sourcePath: string) => {
    const normalizedSourcePath = path.resolve(sourcePath);
    const existingRelativePath = copiedAssetPaths.get(normalizedSourcePath);

    if (existingRelativePath) {
      return existingRelativePath;
    }

    await loadExistingAssetNames();

    if (!didCreateAssetsDirectory) {
      await fs.mkdir(assetsDirectoryPath, { recursive: true });
      didCreateAssetsDirectory = true;
    }

    const assetFilename = createUniqueAssetName(path.basename(normalizedSourcePath), usedAssetNames);
    const targetPath = path.join(assetsDirectoryPath, assetFilename);
    const relativePath = path.posix.join('assets', assetFilename);

    await fs.copyFile(normalizedSourcePath, targetPath);
    copiedAssetPaths.set(normalizedSourcePath, relativePath);
    return relativePath;
  };

  const rewrittenMessages = await Promise.all(messages.map(async (message) => {
    const rewrites = new Map<string, string>();
    const rewrittenAttachments = await Promise.all(message.attachments.map(async (attachment) => {
      const localSourcePath = toLocalSourcePath(attachment.url);

      if (!localSourcePath) {
        return { ...attachment };
      }

      const relativePath = await ensureCopiedAsset(localSourcePath);
      rewrites.set(attachment.url, relativePath);
      rewrites.set(`/workspace/group/attachments/${attachment.name}`, relativePath);

      return {
        ...attachment,
        url: relativePath,
      };
    }));

    const fileUrlMatches = message.content.match(FILE_URL_PATTERN) ?? [];

    for (const fileUrl of fileUrlMatches) {
      if (rewrites.has(fileUrl)) {
        continue;
      }

      const localSourcePath = toLocalSourcePath(fileUrl);

      if (!localSourcePath) {
        continue;
      }

      const relativePath = await ensureCopiedAsset(localSourcePath);
      rewrites.set(fileUrl, relativePath);
    }

    const workspaceAttachmentMatches = message.content.match(WORKSPACE_ATTACHMENT_PATH_PATTERN) ?? [];

    for (const workspacePath of workspaceAttachmentMatches) {
      if (rewrites.has(workspacePath)) {
        continue;
      }

      const attachmentName = path.posix.basename(workspacePath);
      const matchingAttachment = message.attachments.find((attachment) =>
        attachment.name === attachmentName && Boolean(toLocalSourcePath(attachment.url))
      );
      const localSourcePath = matchingAttachment
        ? toLocalSourcePath(matchingAttachment.url)
        : null;

      if (!localSourcePath) {
        continue;
      }

      const relativePath = await ensureCopiedAsset(localSourcePath);
      rewrites.set(workspacePath, relativePath);
    }

    return {
      ...message,
      attachments: rewrittenAttachments,
      content: rewriteContentAssetPaths(message.content, rewrites),
      ...(message.usage ? { usage: { ...message.usage } } : {}),
    };
  }));

  return rewrittenMessages;
}

/** Returns the export payload for conversation messages. */
function createConversationExportPayload(input: {
  exportedAt: string;
  groupId: string;
  groupName: string;
  messages: AgentMessage[];
}) {
  return {
    exportedAt: input.exportedAt,
    groupId: input.groupId,
    groupName: input.groupName,
    messages: input.messages.map<ExportConversationMessage>((message) => ({
      actor: getMessageActor(input.groupId, input.groupName, message.role).actor,
      actorId: getMessageActor(input.groupId, input.groupName, message.role).actorId,
      attachments: message.attachments.map((attachment) => ({ ...attachment })),
      content: message.content,
      id: message.id,
      role: message.role,
      timestamp: new Date(message.createdAt).toISOString(),
    })),
  } satisfies ConversationExportPayload;
}

/** Formats a message timestamp for markdown output. */
function formatMarkdownTimestamp(timestamp: string) {
  return timestamp.replace('T', ' ').slice(0, 19);
}

/** Formats an attachment line for markdown output. */
function formatMarkdownAttachment(attachment: AgentAttachment) {
  if (attachment.kind === 'image') {
    return `![${attachment.name}](${attachment.url})`;
  }

  const caption = attachment.caption?.trim();

  return caption
    ? `- [${attachment.name}](${attachment.url}): ${caption}`
    : `- [${attachment.name}](${attachment.url})`;
}

/** Serializes a payload to markdown. */
function serializeConversationExportAsMarkdown(payload: ConversationExportPayload) {
  const blocks = payload.messages.map((message) => {
    const lines = [
      `## [${message.actor}] — ${formatMarkdownTimestamp(message.timestamp)}`,
      '',
      message.content.trim() || '_No content_',
    ];

    if (message.attachments.length > 0) {
      lines.push('', 'Attachments:', '');
      lines.push(...message.attachments.map(formatMarkdownAttachment));
    }

    return lines.join('\n');
  });

  return [
    `# Conversation Export — ${payload.groupName}`,
    `Exported: ${payload.exportedAt}`,
    '',
    '---',
    '',
    blocks.join('\n\n---\n\n'),
    '',
  ].join('\n');
}

/** Exports the conversation as JSON. */
export async function exportAsJson(input: {
  exportedAt: string;
  filePath: string;
  groupId: string;
  groupName: string;
  messages: AgentMessage[];
}) {
  const exportDirectoryPath = path.dirname(input.filePath);
  const rewrittenMessages = await copyAssetsAndRewritePaths(input.messages, exportDirectoryPath);
  const payload = createConversationExportPayload({
    exportedAt: input.exportedAt,
    groupId: input.groupId,
    groupName: input.groupName,
    messages: rewrittenMessages,
  });

  await fs.writeFile(input.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/** Exports the conversation as Markdown. */
export async function exportAsMarkdown(input: {
  exportedAt: string;
  filePath: string;
  groupId: string;
  groupName: string;
  messages: AgentMessage[];
}) {
  const exportDirectoryPath = path.dirname(input.filePath);
  const rewrittenMessages = await copyAssetsAndRewritePaths(input.messages, exportDirectoryPath);
  const payload = createConversationExportPayload({
    exportedAt: input.exportedAt,
    groupId: input.groupId,
    groupName: input.groupName,
    messages: rewrittenMessages,
  });

  await fs.writeFile(input.filePath, serializeConversationExportAsMarkdown(payload), 'utf8');
}
