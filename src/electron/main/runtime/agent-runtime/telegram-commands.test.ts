// Unit tests for Telegram slash command handler.

import { describe, expect, it, vi } from 'vitest';

import { handleTelegramSlashCommand } from './telegram-commands';
import type { TelegramCommandWorkItem } from './telegram-commands';

const ITEM_ACTIVE: TelegramCommandWorkItem = { id: 'item-1', title: 'Build login page', status: 'active' };
const ITEM_READY: TelegramCommandWorkItem = { id: 'item-2', title: 'Fix navbar bug', status: 'ready' };
const ITEM_DONE: TelegramCommandWorkItem = { id: 'item-3', title: 'Update docs', status: 'done' };

describe('handleTelegramSlashCommand', () => {
  describe('/status', () => {
    it('replies with "No active items." when no active items exist', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/status', () => [ITEM_READY, ITEM_DONE], reply);
      expect(handled).toBe(true);
      expect(reply).toHaveBeenCalledOnce();
      expect(reply.mock.calls[0][0]).toContain('No active items.');
    });

    it('lists active items when they exist', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/status', () => [ITEM_ACTIVE, ITEM_READY], reply);
      expect(handled).toBe(true);
      const text: string = reply.mock.calls[0][0];
      expect(text).toContain('Active items (1)');
      expect(text).toContain('item-1');
      expect(text).toContain('Build login page');
      expect(text).not.toContain('Fix navbar bug');
    });

    it('handles /status with trailing whitespace', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/status  ', () => [], reply);
      expect(handled).toBe(true);
    });
  });

  describe('/list', () => {
    it('replies with "No items." when item list is empty', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/list', () => [], reply);
      expect(handled).toBe(true);
      expect(reply.mock.calls[0][0]).toContain('No items.');
    });

    it('lists all items with their status', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/list', () => [ITEM_ACTIVE, ITEM_READY, ITEM_DONE], reply);
      expect(handled).toBe(true);
      const text: string = reply.mock.calls[0][0];
      expect(text).toContain('All items (3)');
      expect(text).toContain('[active]');
      expect(text).toContain('[ready]');
      expect(text).toContain('[done]');
      expect(text).toContain('Build login page');
      expect(text).toContain('Fix navbar bug');
      expect(text).toContain('Update docs');
    });
  });

  describe('/help', () => {
    it('replies with command list', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/help', () => [], reply);
      expect(handled).toBe(true);
      const text: string = reply.mock.calls[0][0];
      expect(text).toContain('/status');
      expect(text).toContain('/list');
      expect(text).toContain('/help');
      expect(text).toContain('/chatid');
      expect(text).toContain('/ping');
    });
  });

  describe('unrecognized commands', () => {
    it('returns false for unknown slash command', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('/foo', () => [], reply);
      expect(handled).toBe(false);
      expect(reply).not.toHaveBeenCalled();
    });

    it('returns false for plain text (no slash)', async () => {
      const reply = vi.fn().mockResolvedValue(undefined);
      const handled = await handleTelegramSlashCommand('hello world', () => [], reply);
      expect(handled).toBe(false);
      expect(reply).not.toHaveBeenCalled();
    });
  });
});
