import type { ChatTransport } from '@/renderer/features/chat/model/chat-transport';
import type { Conversation } from '@/renderer/features/chat/types';

const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });

function pickResponse(conversation: Conversation | undefined, input: string) {
  const normalized = input.toLowerCase();

  if (normalized.includes('settings')) {
    return [
      'Keep the settings page calm and editorial.',
      '',
      '- Let the left section rail stay narrow and quiet.',
      '- Make theme switching the only live control in v1.',
      '- Frame everything else as prototype defaults or future slots.',
      '',
      'That keeps the page useful without pretending the app already has a backend or persistence layer.',
    ].join('\n');
  }

  if (normalized.includes('theme') || normalized.includes('dark')) {
    return [
      'Use theme as a tone switch, not a gimmick.',
      '',
      'Light mode should feel like warm drafting paper. Dark mode should feel like graphite and glass, with the same spacing, hierarchy, and restraint rather than a blunt inversion.',
    ].join('\n');
  }

  if (normalized.includes('keyboard') || normalized.includes('shortcut')) {
    return [
      'Lean into the keyboard path and keep it legible.',
      '',
      '- `Cmd+K` or `Ctrl+K` should feel like the fastest move in the app.',
      '- `Cmd+,` should always land in Settings.',
      '- Arrow navigation should make the sidebar feel intentional, not passive.',
    ].join('\n');
  }

  const contextLead = conversation
    ? `Building on “${conversation.title}”, the next pass should tighten the shell rather than add surface noise.`
    : 'The next pass should tighten the shell rather than add surface noise.';

  return [
    contextLead,
    '',
    'Keep the layout generous, keep the controls sparse, and let the transcript stay visually dominant.',
    '',
    'If you want, the next iteration can sharpen one area specifically: sidebar density, settings structure, or composer ergonomics.',
  ].join('\n');
}

function splitIntoChunks(content: string) {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += 26) {
    chunks.push(content.slice(index, index + 26));
  }

  return chunks;
}

async function* streamReply(
  conversation: Conversation | undefined,
  input: string,
) {
  const content = pickResponse(conversation, input);
  const chunks = splitIntoChunks(content);

  for (const [index, chunk] of chunks.entries()) {
    await wait(index === 0 ? 120 : 70);
    yield chunk;
  }
}

export const mockChatTransport: ChatTransport = {
  streamReply,
};
