import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import AppShell from '@/renderer/app/AppShell';
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/renderer/app/hooks/use-resizable-sidebar';
import { resetAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';

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

async function createAgent(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getAllByRole('button', { name: /^New agent$/i })[0]!);
  expect(
    await screen.findByRole('button', { name: /Channel: Dune chat/i }),
  ).toBeInTheDocument();
  await user.type(await screen.findByLabelText('Agent name'), name);
  await user.click(screen.getByRole('button', { name: /^Create agent$/i }));
  await waitFor(() => {
    expect(screen.queryByLabelText('Agent name')).not.toBeInTheDocument();
  });
}

describe('AppShell', () => {
  beforeEach(() => {
    resetAppStore();
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    setWindowWidth(1440);
  });

  it('launches empty and opens settings and the command palette through shortcuts', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(screen.getByTestId('window-drag-region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No agents yet.' })).toBeInTheDocument();
    expect(screen.getByTestId('app-sidebar')).toHaveAttribute('data-platform-inset', 'mac');
    expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(await screen.findByTestId('settings-view')).toBeInTheDocument();
    expect(screen.getByTestId('settings-nav')).toHaveAttribute('data-platform-inset', 'mac');
    expect(screen.getByRole('button', { name: /Channels/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Workspace/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Channels/i }));
    expect(
      screen.getByRole('heading', { name: 'External channel catalog' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Configure$/i })).toHaveLength(3);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(
      screen.getByPlaceholderText('Jump to an agent or action…'),
    ).toBeInTheDocument();
  });

  it('opens channels settings directly from the create-agent channel selector', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    await user.click(screen.getAllByRole('button', { name: /^New agent$/i })[0]!);
    await user.click(await screen.findByRole('button', { name: /Channel: Dune chat/i }));

    const channelPopover = await screen.findByTestId('channel-select-popover');

    expect(
      within(channelPopover).getByRole('button', { name: /Select Telegram/i }),
    ).toBeDisabled();

    await user.click(
      within(channelPopover).getByRole('button', { name: /Open Channels settings/i }),
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Agent name')).not.toBeInTheDocument();
      expect(screen.getByTestId('settings-view')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'External channel catalog' }),
      ).toBeInTheDocument();
    });
  });

  it('creates agents and moves through them with arrow-key navigation', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    await createAgent(user, 'Alpha');
    await createAgent(user, 'Beta');

    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    });
  });

  it('submits a prompt and streams the mocked agent reply', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    await createAgent(user, 'Release coordinator');

    await user.type(screen.getByLabelText('Agent composer'), 'Refine the agent shell');
    await user.click(screen.getByRole('button', { name: /^Send$/i }));

    expect(screen.getAllByText('Refine the agent shell').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(
        screen.getAllByText(/Release coordinator should feel like a durable workspace/i)
          .length,
      ).toBeGreaterThan(0);
    });
  });

  it('keeps the composer usable at compact widths while toggling the context panel from the toolbar and keyboard', async () => {
    const user = userEvent.setup();

    setWindowWidth(960);

    render(<AppShell />);
    await createAgent(user, 'Navigator');

    const composer = screen.getByLabelText('Agent composer');

    expect(composer).toBeInTheDocument();
    expect(screen.getByTestId('compact-shell-toolbar')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open sidebar/i }));

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /navigator/i }));

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

  it('disables local input for externally attached mock agents', async () => {
    render(<AppShell />);

    await agentRuntime.service.createAgent({
      channelId: 'telegram',
      name: 'QA triage',
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'QA triage' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Agent composer')).toBeDisabled();
    expect(
      screen.getByText(/This agent is attached to Telegram\. Reply in the source channel\./i),
    ).toBeInTheDocument();
  });

  it('reflows between wide, medium, and compact layouts on resize', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    await createAgent(user, 'Orchestrator');

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

  it('switches to dark theme from settings while the prototype is open', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    fireEvent.keyDown(window, { key: ',', metaKey: true });
    await user.click(screen.getByRole('button', { name: /Dark/i }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });
});
