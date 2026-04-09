import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { AgentAttachment } from '@/renderer/features/agents/types';
import { inferAttachmentKind } from '@/shared/agents/message-content';

const WORKSPACE_GROUP_PREFIX = '/workspace/group/';

function toLocalAttachmentPath(
  source: string,
  options: { groupFolder: string; runtimeRoot: string },
) {
  if (!source.trim()) {
    return null;
  }

  if (source.startsWith('file://')) {
    return fileURLToPath(source);
  }

  if (source.startsWith(WORKSPACE_GROUP_PREFIX)) {
    const relativePath = source.slice(WORKSPACE_GROUP_PREFIX.length);
    return path.join(options.runtimeRoot, 'groups', options.groupFolder, relativePath);
  }

  if (path.isAbsolute(source)) {
    return source;
  }

  return null;
}

export function createAgentAttachmentFromSource(
  source: string,
  options: { groupFolder: string; runtimeRoot: string },
): AgentAttachment | null {
  const localPath = toLocalAttachmentPath(source, options);

  if (!localPath) {
    return null;
  }

  const name = path.basename(localPath) || 'attachment';

  return {
    kind: inferAttachmentKind({ name }),
    name,
    url: pathToFileURL(localPath).toString(),
  };
}

export function normalizeAgentAttachments(
  attachments: unknown,
  options: { groupFolder: string; runtimeRoot: string },
): AgentAttachment[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  const nextAttachments: AgentAttachment[] = [];
  const seenUrls = new Set<string>();

  for (const attachment of attachments) {
    if (typeof attachment === 'string') {
      const normalized = createAgentAttachmentFromSource(attachment, options);

      if (normalized && !seenUrls.has(normalized.url)) {
        seenUrls.add(normalized.url);
        nextAttachments.push(normalized);
      }

      continue;
    }

    if (!attachment || typeof attachment !== 'object') {
      continue;
    }

    const candidate = attachment as Partial<AgentAttachment>;
    const rawUrl = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    const sourceBackedUrl =
      rawUrl && (rawUrl.startsWith('https://') || rawUrl.startsWith('file://'))
        ? rawUrl
        : rawUrl
          ? createAgentAttachmentFromSource(rawUrl, options)?.url ?? ''
          : '';

    if (!sourceBackedUrl || seenUrls.has(sourceBackedUrl)) {
      continue;
    }

    const normalizedKind = inferAttachmentKind({
      ...(typeof candidate.mimeType === 'string' ? { mimeType: candidate.mimeType } : {}),
      ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
      url: sourceBackedUrl,
    });
    const normalizedName =
      typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name
        : path.basename(sourceBackedUrl);

    seenUrls.add(sourceBackedUrl);
    nextAttachments.push({
      ...(typeof candidate.caption === 'string' ? { caption: candidate.caption } : {}),
      kind: normalizedKind,
      ...(typeof candidate.mimeType === 'string' ? { mimeType: candidate.mimeType } : {}),
      name: normalizedName,
      ...(
        typeof candidate.sizeBytes === 'number' && Number.isFinite(candidate.sizeBytes)
          ? { sizeBytes: candidate.sizeBytes }
          : {}
      ),
      url: sourceBackedUrl,
    });
  }

  return nextAttachments;
}
