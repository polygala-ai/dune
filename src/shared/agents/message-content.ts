// Shared agent message content helpers.

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);

const VIDEO_EXTENSIONS = new Set([
  '.m4v',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
]);

const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.oga',
  '.ogg',
  '.wav',
]);

const WORKSPACE_ATTACHMENT_PATTERN = /\((\/workspace\/group\/attachments\/[^)\s]+)\)/g;

/** Extensions from value. */
function extensionFromValue(value: string) {
  const normalized = value.trim().toLowerCase();
  const cleanValue = normalized.startsWith('file://')
    ? new URL(normalized).pathname
    : normalized;
  const lastDot = cleanValue.lastIndexOf('.');
  const lastSlash = Math.max(cleanValue.lastIndexOf('/'), cleanValue.lastIndexOf('\\'));

  if (lastDot <= lastSlash) {
    return '';
  }

  return cleanValue.slice(lastDot);
}

/** Strips markdown syntax. */
export function stripMarkdownSyntax(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```[\w-]*\n?/m, '').replace(/\n?```$/, ''),
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** Summarizes message preview. */
export function summarizeMessagePreview(content: string, maxLength = 92) {
  return stripMarkdownSyntax(content)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Infers attachment kind. */
export function inferAttachmentKind(input: {
  mimeType?: string | null;
  name?: string | null;
  url?: string | null;
}) {
  const mimeType = input.mimeType?.trim().toLowerCase() ?? '';

  if (mimeType.startsWith('image/')) {
    return 'image' as const;
  }

  if (mimeType.startsWith('video/')) {
    return 'video' as const;
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio' as const;
  }

  const extension = extensionFromValue(input.name ?? input.url ?? '');

  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image' as const;
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video' as const;
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio' as const;
  }

  return 'file' as const;
}

/** Extracts workspace attachment paths. */
export function extractWorkspaceAttachmentPaths(content: string) {
  const paths: string[] = [];
  const nextContent = content.replace(WORKSPACE_ATTACHMENT_PATTERN, (_match, attachmentPath) => {
    paths.push(String(attachmentPath));
    return '';
  });

  return {
    content: nextContent.replace(/[ \t]{2,}/g, ' ').trim(),
    paths,
  };
}
