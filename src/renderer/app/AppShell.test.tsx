import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppShell from '@/renderer/app/AppShell';
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/renderer/app/hooks/use-resizable-sidebar';
import { resetAppStore } from '@/renderer/app/store/use-app-store';

vi.mock('@/renderer/features/chat/transports/mock-chat-transport', () => ({
  mockChatTransport: {
    streamReply: async function* streamReply() {
      await Promise.resolve();
      yield 'Mock response';
      yield ' assembled for the prototype.';
    },
  },
}));

function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  });
  fireEvent(window, new Event('resize'));
}

function getSidebarResizeHandle() {
  return screen.getByRole('separator', { name: 'Resize sidebar' });
}

function expectSidebarWidth(width: number) {
  expect(screen.getByTestId('app-shell-layout')).toHaveStyle(
    `--app-shell-sidebar-width: ${width}px`,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    resetAppStore();
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    setWindowWidth(1440);
  });

  it('launches with the context panel hidden and opens settings and the command palette through shortcuts', async () => {
    render(<AppShell />);

    expect(screen.getByTestId('window-drag-region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Studio shell' })).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-platform-inset', 'mac');
    expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /studio shell/i }),
    ).toHaveAttribute('data-active-style', 'fill');
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(await screen.findByTestId('settings-view')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav')).toHaveAttribute('data-platform-inset', 'mac');
    expect(
      screen.getByRole('button', { name: /appearance\s*theme and visual tone/i }),
    ).toHaveAttribute('data-active-style', 'fill');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(
      screen.getByPlaceholderText('Jump to a thread or action…'),
    ).toBeInTheDocument();
  });

  it('moves through conversations with arrow-key navigation', async () => {
    render(<AppShell />);

    expect(screen.getByRole('heading', { name: 'Studio shell' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Composer polish' }),
      ).toBeInTheDocument();
    });
  });

  it('submits a prompt and streams the mocked assistant reply', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    await user.type(screen.getByLabelText('Composer'), 'Refine the settings surface');
    await user.click(screen.getByRole('button', { name: /^Send$/i }));

    expect(screen.getByText('Refine the settings surface')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getAllByText(/Mock response assembled for the prototype\./i).length,
      ).toBeGreaterThan(0);
    });
  });

  it('keeps the composer usable at compact widths while toggling the context panel from the toolbar and keyboard', async () => {
    const user = userEvent.setup();

    setWindowWidth(960);

    render(<AppShell />);

    const composer = screen.getByLabelText('Composer');

    expect(composer).toBeInTheDocument();
    expect(screen.getByTestId('compact-shell-toolbar')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open sidebar/i }));

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /composer polish/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    });

    const [showInspectorButton] = screen.getAllByRole('button', {
      name: /show inspector/i,
    });

    if (!showInspectorButton) {
      throw new Error('Expected the compact toolbar to render an inspector button.');
    }

    await user.click(showInspectorButton);

    await waitFor(() => {
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
      expect(
        screen.getByLabelText('Close context panel backdrop'),
      ).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: ',', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    });
  });

  it('reflows between wide, medium, and compact layouts on resize', async () => {
    render(<AppShell />);

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    });

    expect(
      screen.queryByLabelText('Close context panel backdrop'),
    ).not.toBeInTheDocument();

    setWindowWidth(1300);

    await waitFor(() => {
      expect(
        screen.getByLabelText('Close context panel backdrop'),
      ).toBeInTheDocument();
    });

    setWindowWidth(960);

    await waitFor(() => {
      expect(screen.getByTestId('compact-shell-toolbar')).toBeInTheDocument();
      expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    });

    setWindowWidth(1500);

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
      expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
      expect(
        screen.queryByLabelText('Close context panel backdrop'),
      ).not.toBeInTheDocument();
    });
  });

  it('supports keyboard resizing on desktop and clamps the width', () => {
    render(<AppShell />);

    const resizeHandle = getSidebarResizeHandle();

    resizeHandle.focus();
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_DEFAULT),
    );

    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '248');
    expectSidebarWidth(248);

    fireEvent.keyDown(resizeHandle, { key: 'End' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_MAX),
    );

    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_MAX),
    );

    fireEvent.keyDown(resizeHandle, { key: 'Home' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_MIN),
    );

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_MIN),
    );
    expectSidebarWidth(SIDEBAR_WIDTH_MIN);
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(
      String(SIDEBAR_WIDTH_MIN),
    );
  });

  it('restores a persisted desktop sidebar width across remounts', () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '320');

    const firstRender = render(<AppShell />);

    expect(getSidebarResizeHandle()).toHaveAttribute('aria-valuenow', '320');
    expectSidebarWidth(320);

    firstRender.unmount();

    render(<AppShell />);

    expect(getSidebarResizeHandle()).toHaveAttribute('aria-valuenow', '320');
    expectSidebarWidth(320);
  });

  it('falls back or clamps persisted sidebar widths to safe bounds', async () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, 'not-a-number');

    const firstRender = render(<AppShell />);

    expect(getSidebarResizeHandle()).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_DEFAULT),
    );
    await waitFor(() => {
      expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe(
        String(SIDEBAR_WIDTH_DEFAULT),
      );
    });

    firstRender.unmount();
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '120');

    const secondRender = render(<AppShell />);

    expect(getSidebarResizeHandle()).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_MIN),
    );

    secondRender.unmount();
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '999');

    render(<AppShell />);

    expect(getSidebarResizeHandle()).toHaveAttribute(
      'aria-valuenow',
      String(SIDEBAR_WIDTH_MAX),
    );
  });

  it('keeps the saved desktop width when cycling through compact mode', async () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '320');

    render(<AppShell />);

    expect(getSidebarResizeHandle()).toHaveAttribute('aria-valuenow', '320');
    expectSidebarWidth(320);

    setWindowWidth(960);

    await waitFor(() => {
      expect(
        screen.queryByRole('separator', { name: 'Resize sidebar' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    });

    setWindowWidth(1500);

    await waitFor(() => {
      expect(getSidebarResizeHandle()).toHaveAttribute('aria-valuenow', '320');
      expectSidebarWidth(320);
    });
  });

  it('switches to dark theme from settings in-session', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    fireEvent.keyDown(window, { key: ',', metaKey: true });
    await user.click(screen.getByRole('button', { name: /Dark/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });
});
