import type { ComponentPropsWithoutRef, MouseEvent } from 'react';

import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import type {
  AgentAttachment,
  PresentedAgentMessage,
} from '@/renderer/features/agents/types';
import { cn } from '@/renderer/shared/lib/utils';

function isSafeUrl(url: string, allowedProtocols: ReadonlySet<string>) {
  try {
    const parsed = new URL(url);
    return allowedProtocols.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isSafeLinkUrl(url: string) {
  return isSafeUrl(url, new Set(['https:']));
}

function isSafeMediaUrl(url: string) {
  return isSafeUrl(url, new Set(['file:', 'https:']));
}

async function openExternalUrl(event: MouseEvent<HTMLAnchorElement>, url: string) {
  event.preventDefault();

  if (typeof window.duneDesktop?.openExternal === 'function') {
    await window.duneDesktop.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function FileAttachmentChip({ attachment }: { attachment: AgentAttachment }) {
  const href = isSafeMediaUrl(attachment.url) ? attachment.url : null;

  if (!href) {
    return <span className="message-file-chip">{attachment.name}</span>;
  }

  return (
    <a
      className="message-file-chip"
      href={href}
      onClick={(event) => {
        void openExternalUrl(event, href);
      }}
      rel="noreferrer"
      target="_blank"
    >
      {attachment.name}
    </a>
  );
}

function AttachmentCard({ attachment }: { attachment: AgentAttachment }) {
  const isSafeSource = isSafeMediaUrl(attachment.url);

  if (!isSafeSource) {
    return <FileAttachmentChip attachment={attachment} />;
  }

  if (attachment.kind === 'image') {
    return (
      <figure className="message-attachment-card">
        <img
          alt={attachment.name}
          className="message-attachment-image"
          loading="lazy"
          src={attachment.url}
        />
        {attachment.caption ? (
          <figcaption className="message-attachment-caption">{attachment.caption}</figcaption>
        ) : null}
      </figure>
    );
  }

  if (attachment.kind === 'video') {
    return (
      <figure className="message-attachment-card">
        <video
          className="message-attachment-video"
          controls
          preload="metadata"
          src={attachment.url}
        />
        <figcaption className="message-attachment-caption">{attachment.name}</figcaption>
      </figure>
    );
  }

  if (attachment.kind === 'audio') {
    return (
      <figure className="message-attachment-card">
        <audio className="message-attachment-audio" controls preload="metadata" src={attachment.url} />
        <figcaption className="message-attachment-caption">{attachment.name}</figcaption>
      </figure>
    );
  }

  return <FileAttachmentChip attachment={attachment} />;
}

function AttachmentRail({ attachments }: { attachments: AgentAttachment[] }) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="message-attachment-rail mt-3">
      {attachments.map((attachment) => (
        <AttachmentCard attachment={attachment} key={`${attachment.url}-${attachment.name}`} />
      ))}
    </div>
  );
}

function MarkdownLink({
  children,
  href,
  ...props
}: ComponentPropsWithoutRef<'a'>) {
  const safeHref = typeof href === 'string' && isSafeLinkUrl(href) ? href : null;

  if (!safeHref) {
    return <span>{children}</span>;
  }

  return (
    <a
      {...props}
      className="prose-message-link"
      href={safeHref}
      onClick={(event) => {
        void openExternalUrl(event, safeHref);
      }}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function MarkdownImage({
  alt,
  src,
}: ComponentPropsWithoutRef<'img'>) {
  const safeSrc = typeof src === 'string' && isSafeMediaUrl(src) ? src : null;

  if (!safeSrc) {
    return <span>{alt ?? 'Image'}</span>;
  }

  return (
    <img
      alt={alt ?? ''}
      className="prose-message-image"
      loading="lazy"
      src={safeSrc}
    />
  );
}

const markdownComponents: Components = {
  a: MarkdownLink,
  blockquote: ({ children }) => <blockquote className="prose-message-blockquote">{children}</blockquote>,
  code: ({ children, className, ...props }) => {
    const isInline = !className;

    if (isInline) {
      return (
        <code {...props} className="prose-inline-code">
          {children}
        </code>
      );
    }

    return (
      <pre className="prose-code-block">
        <code {...props} className={cn('prose-code-text', className)}>
          {children}
        </code>
      </pre>
    );
  },
  h1: ({ children }) => <h1 className="prose-message-heading prose-message-heading-1">{children}</h1>,
  h2: ({ children }) => <h2 className="prose-message-heading prose-message-heading-2">{children}</h2>,
  h3: ({ children }) => <h3 className="prose-message-heading prose-message-heading-3">{children}</h3>,
  img: MarkdownImage,
  li: ({ children }) => <li className="prose-message-list-item">{children}</li>,
  ol: ({ children }) => <ol className="prose-message-list prose-message-list-ordered">{children}</ol>,
  p: ({ children }) => <p className="prose-message-paragraph">{children}</p>,
  table: ({ children }) => <div className="prose-table-wrap"><table className="prose-message-table">{children}</table></div>,
  td: ({ children }) => <td className="prose-message-cell">{children}</td>,
  th: ({ children }) => <th className="prose-message-cell prose-message-cell-head">{children}</th>,
  ul: ({ children }) => <ul className="prose-message-list prose-message-list-unordered">{children}</ul>,
};

function transformMarkdownUrl(url: string) {
  return isSafeLinkUrl(url) || isSafeMediaUrl(url) ? url : '';
}

export function AgentMessageContent({
  message,
}: {
  message: Pick<PresentedAgentMessage, 'attachments' | 'content' | 'format'>;
}) {
  const content = message.content || '…';

  return (
    <>
      {message.format === 'markdown' ? (
        <div className="prose-message mt-2 break-words text-[15px] leading-7 text-app-text">
          <ReactMarkdown
            components={markdownComponents}
            rehypePlugins={[
              [rehypeSanitize, defaultSchema],
            ]}
            remarkPlugins={[remarkGfm]}
            skipHtml
            urlTransform={transformMarkdownUrl}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="prose-message prose-message-plain mt-2 break-words text-[15px] leading-7 text-app-text">
          {content}
        </div>
      )}

      <AttachmentRail attachments={message.attachments} />
    </>
  );
}
