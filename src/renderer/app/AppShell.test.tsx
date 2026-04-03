import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppShell from '@/renderer/app/AppShell';
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/renderer/app/hooks/use-resizable-sidebar';
import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
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
  if (screen.queryByRole('dialog')) {
    await user.keyboard('{Escape}');
  }

  const existingCreateButton = screen.queryByRole('button', {
    name: /^(New|Create) agent$/i,
  });

  if (existingCreateButton) {
    await user.click(existingCreateButton);
  } else if (screen.queryByLabelText('Agent composer')) {
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
  } else {
    await user.click(await screen.findByRole('tab', { name: /^Agents$/i }));
    await user.click(await screen.findByRole('button', { name: /^New agent$/i }));
  }

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

  it('launches on the project board and opens settings and the command palette through shortcuts', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(screen.getByTestId('window-drag-region')).toBeInTheDocument();
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Research Platform' })).toBeInTheDocument();
    const sidebar = screen.getByTestId('app-sidebar');

    expect(sidebar).toHaveAttribute('data-platform-inset', 'mac');
    expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /^Plugins$/i })).toBeInTheDocument();
    expect(within(sidebar).getByText('Projects')).toBeInTheDocument();
    expect(within(sidebar).getByRole('button', { name: /^Research Platform$/i })).toBeInTheDocument();
    expect(within(sidebar).queryByRole('button', { name: /^Board$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Board$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Agents$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Activity$/i })).toBeInTheDocument();

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
    const commandDialog = screen.getByRole('dialog');
    expect(
      screen.getByPlaceholderText('Jump to a project, work item, agent, or action…'),
    ).toBeInTheDocument();
    expect(within(commandDialog).getByText('New project', { exact: true })).toBeInTheDocument();
    expect(
      within(commandDialog).getAllByText('Research Platform', { exact: true }).length,
    ).toBeGreaterThan(0);
  });

  it('opens channels settings directly from the create-agent channel selector', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));
    await user.click(await screen.findByRole('button', { name: /^New agent$/i }));
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

  it('opens settings from the desktop sidebar footer row', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await user.click(
      within(screen.getByTestId('app-sidebar')).getByRole('button', { name: /^Settings$/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('settings-view')).toBeInTheDocument();
    });
  });

  it('opens settings from the compact sidebar drawer footer row', async () => {
    const user = userEvent.setup();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open sidebar/i }));

    const drawer = await screen.findByRole('dialog', { name: 'App sidebar' });

    await user.click(
      within(drawer).getByRole('button', { name: /^Settings$/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('settings-view')).toBeInTheDocument();
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
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Navigator',
      projectId: useAppStore.getState().selectedProjectId,
    });

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Work item inspector' }),
      ).not.toBeInTheDocument();
    });

    await user.click(await screen.findByRole('tab', { name: /^Agents$/i }));
    await user.click(await screen.findByRole('button', { name: /^Open agent$/i }));

    const composer = screen.getByLabelText('Agent composer');

    expect(composer).toBeInTheDocument();
    expect(screen.getByTestId('compact-shell-toolbar')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open sidebar/i }));

    await waitFor(() => {
      expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByRole('dialog', { name: 'App sidebar' })).getByRole('button', {
        name: /close sidebar/i,
      }),
    );

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
    const user = userEvent.setup();

    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await agentRuntime.service.createAgent({
      channelId: 'telegram',
      name: 'QA triage',
      projectId: useAppStore.getState().selectedProjectId,
    });

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));
    await user.click(await screen.findByRole('button', { name: /^Open agent$/i }));

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
    expect(resizeHandle).toHaveAttribute('aria-valuenow', '232');
    expectSidebarWidth(232);

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

  it('supports project and work-item creation from the default project page', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    expect(screen.getByText('Homepage copy rewrite')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^New project$/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await user.click(
      within(screen.getByRole('dialog')).getByText('New project', { exact: true }),
    );
    expect(screen.queryByText('Accent')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Project name'), 'Studio Ops');
    await user.type(
      screen.getByLabelText('Description'),
      'Support the next workflow design pass.',
    );
    await user.click(screen.getByRole('button', { name: /^Create project$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Studio Ops' })).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('app-sidebar')).getByRole('button', {
        name: /^Studio Ops$/i,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^New work item$/i })[0]!);
    await user.type(screen.getByLabelText('Work item title'), 'Review the first-run board');
    await user.type(
      screen.getByLabelText('Brief'),
      'Make the new route calmer and more direct.',
    );
    await user.click(screen.getByRole('button', { name: /^Create work item$/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Review the first-run board')).toBeInTheDocument();
    });
  });

  it('opens project settings from the header menu and saves project metadata', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Project actions$/i }));
    expect(screen.getByRole('button', { name: /^Configure project$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete project$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Configure project$/i }));
    expect(screen.getByText('Project settings')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-page-scroll')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-board-slot')).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText('Project name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Studio Systems');
    await user.clear(screen.getByLabelText('Description'));
    await user.type(
      screen.getByLabelText('Description'),
      'Coordinate the calmer project shell.',
    );
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Studio Systems' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^Board$/i })).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('app-sidebar')).getByRole('button', {
        name: /^Studio Systems$/i,
      }),
    ).toBeInTheDocument();
  });

  it('deletes the last project from project settings and falls back to the empty state', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await agentRuntime.service.createAgent({
      channelId: 'dune-chat',
      name: 'Project agent',
      projectId: useAppStore.getState().selectedProjectId,
    });

    await user.click(screen.getByRole('button', { name: /^Project actions$/i }));
    await user.click(screen.getByRole('button', { name: /^Configure project$/i }));
    await user.click(screen.getByRole('button', { name: /^Delete project$/i }));
    const deleteDialog = await screen.findByRole('dialog', {
      name: /^Delete Research Platform\?$/i,
    });
    await user.click(
      within(deleteDialog).getByRole('button', { name: /^Delete project$/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^New project$/i })).toBeInTheDocument();
    });
    expect(useAppStore.getState().agents).toEqual([]);
    expect(
      within(screen.getByTestId('app-sidebar')).queryByRole('button', {
        name: /^Research Platform$/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('uses a shared page scroller for activity and agents while keeping board in the board slot', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-board-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-page-scroll')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Activity$/i }));
    expect(screen.getByTestId('workflow-project-page-scroll')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-board-slot')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Project timeline/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));
    expect(screen.getByTestId('workflow-project-page-scroll')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-board-slot')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Project agents/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Board$/i }));
    expect(screen.getByTestId('workflow-project-board-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-page-scroll')).not.toBeInTheDocument();
  });

  it('switches projects from the sidebar list', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await act(async () => {
      useAppStore.getState().createProject({
        description: 'Support the calm project shell.',
        name: 'Studio Ops',
      });
    });

    await user.click(
      within(screen.getByTestId('app-sidebar')).getByRole('button', {
        name: /^Research Platform$/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Research Platform' })).toBeInTheDocument();
    });
  });

  it('opens the plugins placeholder from the sidebar rail', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    await user.click(
      within(screen.getByTestId('app-sidebar')).getByRole('button', { name: /^Plugins$/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Plugins' })).toBeInTheDocument();
      expect(screen.getByText('Plugins will appear here once the project shell is ready to host them.')).toBeInTheDocument();
    });
  });

  it('centers the compact work item inspector modal', async () => {
    const user = userEvent.setup();

    setWindowWidth(960);

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Open Homepage copy rewrite$/i }),
    );

    const inspectorDialog = await screen.findByRole('dialog', {
      name: 'Work item inspector',
    });

    expect(inspectorDialog).toHaveClass(
      'left-1/2',
      'top-1/2',
      '-translate-x-1/2',
      '-translate-y-1/2',
    );
    expect(inspectorDialog).not.toHaveClass('right-4', 'translate-x-0', 'translate-y-0');
    expect(screen.getByTestId('workflow-item-inspector')).toBeInTheDocument();
  });

  it('creates an item agent from the inspector and opens the agent workspace', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /^Open Homepage copy rewrite$/i }),
    );
    expect(screen.getByTestId('workflow-item-inspector')).toBeInTheDocument();
    await user.click(
      within(screen.getByTestId('workflow-item-inspector')).getByRole('button', {
        name: /^Create agent$/i,
      }),
    );

    await waitFor(() => {
      expect(
        within(screen.getByTestId('workflow-item-inspector')).getByRole('button', {
          name: /^Open agent$/i,
        }),
      ).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByTestId('workflow-item-inspector')).getByRole('button', {
        name: /^Open agent$/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: 'Homepage copy rewrite agent',
        }),
      ).toBeInTheDocument();
    });
  });

  it('restores a persisted workflow snapshot from local storage', async () => {
    const storageGet = vi.fn(async () => ({
      missions: [
        {
          brief: 'Reload the saved mission from storage.',
          createdAt: 1_700_000_000_000,
          id: 'mission-restored',
          linkedAgents: [],
          projectId: 'project-restored',
          sortOrder: 0,
          status: 'active',
          tasks: [],
          title: 'Restored workflow mission',
          updatedAt: 1_700_000_000_000,
          workProducts: [],
          workflowEvents: [],
        },
      ],
      projects: [
        {
          color: '#A86D46',
          createdAt: 1_700_000_000_000,
          description: 'Recovered from storage',
          id: 'project-restored',
          name: 'Recovered board',
          updatedAt: 1_700_000_000_000,
        },
      ],
      selectedMissionId: 'mission-restored',
      selectedProjectId: 'project-restored',
    }));

    window.duneDesktop = {
      ...window.duneDesktop,
      platform: 'darwin',
      storageGet,
      storageSet: vi.fn(async () => undefined),
    };

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Recovered board' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('Restored workflow mission')).toBeInTheDocument();
    });
  });
});
