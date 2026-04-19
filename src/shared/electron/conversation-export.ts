// Shared conversation export types.

/** Supported conversation export formats. */
export type ConversationExportFormat = 'json' | 'markdown';

/** Result returned by the desktop export flow. */
export interface ConversationExportResult {
  canceled?: boolean;
  filePath?: string;
  success: boolean;
}
