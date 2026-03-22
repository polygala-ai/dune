/**
 * Simple markdown → Slack Block Kit converter.
 * Slack's mrkdwn is close enough to markdown that most text passes through directly.
 * We split on code fences and wrap each chunk as a section block.
 */

type Block = { type: string; text?: { type: string; text: string }; [key: string]: unknown }

const MAX_TEXT_LENGTH = 3000 // Slack's limit per text block
const IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g

export interface ExtractedImages {
  textWithoutImages: string
  images: { url: string; alt: string }[]
}

/** Extract markdown image references from text and return them separately. */
export function extractImageUrls(markdown: string): ExtractedImages {
  const images: { url: string; alt: string }[] = []
  const textWithoutImages = markdown.replace(IMAGE_RE, (_match, alt, url) => {
    images.push({ url, alt: alt || 'image' })
    return ''
  }).replace(/\n{3,}/g, '\n\n').trim()
  return { textWithoutImages, images }
}

export function markdownToBlocks(markdown: string): Block[] {
  if (!markdown.trim()) return []

  const blocks: Block[] = []
  // Split on triple-backtick code fences
  const parts = markdown.split(/(```[\s\S]*?```)/)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Code fences — keep as-is (Slack mrkdwn renders triple backticks)
    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
      pushTextBlock(blocks, trimmed)
    } else {
      pushTextBlock(blocks, trimmed)
    }
  }

  return blocks.length > 0 ? blocks : [{ type: 'section', text: { type: 'mrkdwn', text: markdown.slice(0, MAX_TEXT_LENGTH) } }]
}

function pushTextBlock(blocks: Block[], text: string): void {
  // Chunk long text to stay within Slack's limit
  for (let i = 0; i < text.length; i += MAX_TEXT_LENGTH) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: text.slice(i, i + MAX_TEXT_LENGTH) },
    })
  }
}
