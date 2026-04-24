// App shell UI tests.

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
  CONTEXT_PANEL_WIDTH_DEFAULT,
  CONTEXT_PANEL_WIDTH_MAX,
  CONTEXT_PANEL_WIDTH_MIN,
  CONTEXT_PANEL_WIDTH_STORAGE_KEY,
} from '@/renderer/app/hooks/use-resizable-context-panel';
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '@/renderer/app/hooks/use-resizable-sidebar';
import { resetAppStore, useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import { createSeedWorkflowSnapshot } from '@/renderer/features/workflow/model/workflow-seed';
import { createProjectMainAgentName } from '@/shared/agents/project-main-name';

/** Titlebar area rect input shape. */
interface TitlebarAreaRectInput {
  height: number;
  width: number;
  x: number;
  y: number;
}

const DEFAULT_TITLEBAR_AREA_RECT: TitlebarAreaRectInput = {
  height: 46,
  width: 882,
  x: 78,
  y: 0,
};

/** Window controls overlay mock. */
class WindowControlsOverlayMock extends EventTarget implements WindowControlsOverlay {
  visible = true;
  private rect: TitlebarAreaRectInput;

  constructor(rect: TitlebarAreaRectInput = DEFAULT_TITLEBAR_AREA_RECT) {
    super();
    this.rect = rect;
  }

  /** Returns titlebar area rect. */
  getTitlebarAreaRect() {
    return new DOMRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
  }

  /** Sets rect. */
  setRect(rect: TitlebarAreaRectInput) {
    this.rect = rect;
    this.dispatchEvent(new Event('geometrychange'));
  }
}

/** Sets window controls overlay mock. */
function setWindowControlsOverlayMock(overlay?: WindowControlsOverlay) {
  Object.defineProperty(window.navigator, 'windowControlsOverlay', {
    configurable: true,
    value: overlay,
  });
}

/** Installs window controls overlay mock. */
function installWindowControlsOverlayMock(rect?: TitlebarAreaRectInput) {
  const overlay = new WindowControlsOverlayMock(rect);
  setWindowControlsOverlayMock(overlay);
  return overlay;
}

/** Sets window width. */
function setWindowWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  });
  fireEvent(window, new Event('resize'));
}

/** Returns sidebar resize handle. */
function getSidebarResizeHandle() {
  return screen.getByRole('separator', { name: 'Resize sidebar' });
}

/** Returns context panel resize handle. */
function getContextPanelResizeHandle() {
  return screen.getByRole('separator', { name: 'Resize inspector' });
}

/** Returns context panel dialog. */
function getContextPanelDialog() {
  return screen.getByRole('dialog', { name: 'Agent inspector' });
}

/** Returns open agent button. */
function getOpenAgentButton(agentName: string) {
  const agentLabel = screen.getByText(agentName);
  const agentRow = agentLabel.closest('div[class*="justify-between"]');

  if (!(agentRow instanceof HTMLElement)) {
    throw new Error(`Expected an agent row for "${agentName}".`);
  }

  return within(agentRow).getByRole('button', { name: /^Open agent$/i });
}

/** Asserts sidebar width. */
function expectSidebarWidth(width: number) {
  expect(screen.getByTestId('app-shell-layout')).toHaveStyle(
    `--app-shell-sidebar-width: ${width}px`,
  );
}

/** Asserts context panel width. */
function expectContextPanelWidth(width: number) {
  expect(screen.getByTestId('app-shell-layout')).toHaveStyle(
    `--app-shell-context-width: ${width}px`,
  );
  expect(screen.getByTestId('app-shell-layout')).toHaveStyle(
    `--app-shell-overlay-context-width: ${width}px`,
  );
}

/** Creates agent. */
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
    window.localStorage.removeItem(CONTEXT_PANEL_WIDTH_STORAGE_KEY);
    window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    setWindowControlsOverlayMock(undefined);
    setWindowWidth(1440);
    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      storageGet: vi.fn(async () => createSeedWorkflowSnapshot(1_700_000_000_000)),
      storageSet: vi.fn(async () => undefined),
    };
  });

  it('shows the empty project shell on first launch without persisted workflow state', async () => {
    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      storageGet: vi.fn(async () => null),
      storageSet: vi.fn(async () => undefined),
    };

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^New project$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-board')).not.toBeInTheDocument();
  });

  it('repairs persisted work items with invalid statuses instead of clearing the workflow', async () => {
    const snapshot = createSeedWorkflowSnapshot(1_700_000_000_000);
    const storageSet = vi.fn(async () => undefined);
    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      storageGet: vi.fn(async () => ({
        ...snapshot,
        items: snapshot.items.map((item, index) =>
          index === 0
            ? { ...item, status: 'archived' }
            : item,
        ),
      })),
      storageSet,
    };

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByTestId('workflow-board')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Research Platform' })).toBeInTheDocument();

    await waitFor(() => {
      expect(storageSet).toHaveBeenCalledWith(
        'workflow',
        'snapshot',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              status: 'inbox',
              title: 'Capture new research angles',
            }),
          ]),
          projects: expect.arrayContaining([
            expect.objectContaining({ name: 'Research Platform' }),
          ]),
        }),
      );
    });
  });

  it('preserves persisted acceptance items during workflow hydration', async () => {
    const snapshot = createSeedWorkflowSnapshot(1_700_000_000_000);
    const acceptanceItemId = snapshot.items[0]!.id;

    window.duneDesktop = {
      ...window.duneDesktop,
      platform: window.duneDesktop?.platform ?? 'darwin',
      storageGet: vi.fn(async () => ({
        ...snapshot,
        items: snapshot.items.map((item, index) =>
          index === 0
            ? { ...item, status: 'acceptance' }
            : item,
        ),
      })),
      storageSet: vi.fn(async () => undefined),
    };

    render(<AppShell />);

    await waitFor(() => {
      expect(screen.getByTestId('workflow-board')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        useAppStore.getState().items.find((item) => item.id === acceptanceItemId)?.status,
      ).toBe('acceptance');
    });
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
    expect(screen.queryByRole('button', { name: /Channels/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Workspace/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Models/i }));
    expect(
      screen.getByRole('heading', { name: 'Providers' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const commandDialog = screen.getByRole('dialog');
    expect(
      screen.getByPlaceholderText('Search titles, briefs, and work products…'),
    ).toBeInTheDocument();
    expect(
      within(commandDialog).getAllByText('Homepage copy rewrite', { exact: true }).length,
    ).toBeGreaterThan(0);
  });

  it('shows inline Telegram setup directly from the create-agent channel selector', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));
    await user.click(await screen.findByRole('button', { name: /^New agent$/i }));
    await user.click(await screen.findByRole('button', { name: /Channel: Dune chat/i }));

    const channelPopover = await screen.findByTestId('channel-select-popover');

    expect(
      within(channelPopover).getByRole('button', { name: /Select Telegram/i }),
    ).toBeEnabled();

    await user.click(
      within(channelPopover).getByRole('button', { name: /Select Telegram/i }),
    );

    expect(await screen.findByRole('heading', { name: 'Telegram setup' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /I already have a token/i }));
    expect(await screen.findByLabelText('Bot token')).toBeInTheDocument();
    expect(screen.getByTestId('telegram-settings-card')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-view')).not.toBeInTheDocument();
  });

  it('disables the project agent create action during startup and restores the empty state once ready', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    act(() => {
      const { runtimeInfo } = useAppStore.getState();

      useAppStore.setState({
        agents: [],
        runtimeInfo: {
          ...runtimeInfo,
          message: 'Connecting to the desktop runtime.',
          status: 'starting',
        },
      });
    });

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));

    const titlebarCreateButton = await screen.findByTestId('titlebar-project-create-button');

    expect(titlebarCreateButton).toBeDisabled();
    expect(screen.getByText('Initializing agents')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'No agents yet. Create the first project agent when a work item is ready for execution.',
      ),
    ).not.toBeInTheDocument();

    act(() => {
      const { runtimeInfo } = useAppStore.getState();

      useAppStore.setState({
        runtimeInfo: {
          ...runtimeInfo,
          status: 'ready',
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('titlebar-project-create-button')).toBeEnabled();
    });
    expect(
      screen.getByText(
        'No agents yet. Create the first project agent when a work item is ready for execution.',
      ),
    ).toBeInTheDocument();
  });

  it('reconciles one built-in main agent per project in the workflow shell', async () => {
    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await waitFor(() => {
      const state = useAppStore.getState();
      const selectedProjectId = state.selectedProjectId;
      const projectMainAgents = state.agents.filter((agent) =>
        agent.projectId === selectedProjectId && agent.definition.archetype === 'project-main',
      );

      expect(projectMainAgents).toHaveLength(1);
      expect(projectMainAgents[0]?.name).toBe(createProjectMainAgentName(selectedProjectId ?? ''));
    });

    act(() => {
      useAppStore.getState().createProject({
        description: 'Support the follow-up shell pass.',
        name: 'Studio Ops',
        rootPath: null,
      });
    });

    await waitFor(() => {
      const state = useAppStore.getState();
      const studioProject = state.projects.find((project) => project.name === 'Studio Ops');
      const projectMainAgents = state.agents.filter((agent) =>
        agent.projectId === studioProject?.id && agent.definition.archetype === 'project-main',
      );

      expect(studioProject).toBeTruthy();
      expect(projectMainAgents).toHaveLength(1);
      expect(projectMainAgents[0]?.name).toBe(
        createProjectMainAgentName(studioProject?.id ?? ''),
      );
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

  it('mounts the compact macOS sidebar toggle in the titlebar overlay beside native controls', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('titlebar-workflow-title')).toHaveTextContent('Research Platform');
    expect(
      within(screen.getByTestId('titlebar-sidebar-toggle-slot')).getByRole('button', {
        name: /open sidebar/i,
      }),
    ).toHaveAttribute('data-testid', 'titlebar-sidebar-toggle');
    expect(
      within(screen.getByTestId('window-drag-region')).queryByRole('button', {
        name: /open sidebar/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId('titlebar-sidebar-toggle'));

    expect(await screen.findByRole('dialog', { name: 'App sidebar' })).toBeInTheDocument();
  });

  it('reuses the titlebar trailing slot for workflow project actions on compact macOS', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const titlebarSlot = screen.getByTestId('titlebar-project-actions-slot');
    const actionsButton = within(titlebarSlot).getByTestId('project-actions-button');

    expect(actionsButton).toBeInTheDocument();
    expect(screen.queryByTestId('titlebar-inspector-toggle-slot')).not.toBeInTheDocument();

    await user.click(actionsButton);

    expect(await screen.findByTestId('workflow-project-settings-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-settings-scroll-region')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-settings-footer')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Project settings' })).toBeInTheDocument();
  });

  it('uses compact macOS titlebar back and forward buttons to navigate workflow pages', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const navSlot = screen.getByTestId('titlebar-navigation-slot');
    const backButton = within(navSlot).getByRole('button', { name: /^Go back$/i });
    const forwardButton = within(navSlot).getByRole('button', { name: /^Go forward$/i });

    expect(backButton).toBeDisabled();
    expect(forwardButton).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));

    expect(screen.getByRole('tab', { name: /^Agents$/i })).toHaveAttribute('aria-selected', 'true');
    expect(backButton).toBeEnabled();
    expect(forwardButton).toBeDisabled();

    await user.click(backButton);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Board$/i })).toHaveAttribute('aria-selected', 'true');
    });

    expect(forwardButton).toBeEnabled();

    await user.click(forwardButton);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Agents$/i })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('keeps the compact macOS titlebar layout after widening the window when native overlay metrics are available', async () => {
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    expect(screen.getByTestId('titlebar-sidebar-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();

    setWindowWidth(1500);

    await waitFor(() => {
      expect(screen.getByTestId('titlebar-sidebar-toggle')).toBeInTheDocument();
      expect(screen.getByTestId('titlebar-navigation-slot')).toBeInTheDocument();
      expect(screen.queryByTestId('app-sidebar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
    });
  });

  it('moves the compact macOS workflow create action into the titlebar on board view', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const titlebarCreateSlot = screen.getByTestId('titlebar-project-create-slot');
    const createButton = within(titlebarCreateSlot).getByRole('button', { name: /^New work item$/i });

    expect(createButton).toBeInTheDocument();
    expect(screen.queryByText('New work item')).not.toBeInTheDocument();

    await user.click(createButton);

    expect(
      within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Create work item' }),
    ).toBeInTheDocument();
  });

  it('switches the compact macOS titlebar create action to new agent on the agents tab', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));

    const titlebarCreateSlot = await screen.findByTestId('titlebar-project-create-slot');
    const createButton = within(titlebarCreateSlot).getByRole('button', { name: /^New agent$/i });

    expect(createButton).toBeInTheDocument();
    expect(screen.queryByText('New agent')).not.toBeInTheDocument();

    await user.click(createButton);

    expect(
      within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Name the agent' }),
    ).toBeInTheDocument();
  });

  it('updates macOS titlebar toggle placement when native overlay metrics change', async () => {
    const overlay = installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const shell = screen
      .getByTestId('titlebar-sidebar-toggle-slot')
      .closest('.window-shell');

    if (!(shell instanceof HTMLElement)) {
      throw new Error('Expected titlebar shell wrapper.');
    }

    await waitFor(() => {
      expect(shell.style.getPropertyValue('--app-shell-titlebar-toggle-left')).toBe('90px');
      expect(shell.style.getPropertyValue('--app-shell-titlebar-toggle-top')).toBe('5px');
      expect(shell.style.getPropertyValue('--app-drag-strip-height')).toBe('46px');
    });

    act(() => {
      overlay.setRect({
        height: 48,
        width: 860,
        x: 96,
        y: 2,
      });
    });

    await waitFor(() => {
      expect(shell.style.getPropertyValue('--app-shell-titlebar-toggle-left')).toBe('108px');
      expect(shell.style.getPropertyValue('--app-shell-titlebar-toggle-top')).toBe('8px');
      expect(shell.style.getPropertyValue('--app-drag-strip-height')).toBe('50px');
    });
  });

  it('mounts the compact macOS inspector toggle in the titlebar without shifting its toolbar-side inset', async () => {
    const user = userEvent.setup();
    installWindowControlsOverlayMock();

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await act(async () => {
      await agentRuntime.service.createAgent({
        channelId: 'dune-chat',
        name: 'Navigator',
        projectId: useAppStore.getState().selectedProjectId,
      });
    });

    await user.click(await screen.findByRole('tab', { name: /^Agents$/i }));
    await user.click(getOpenAgentButton('Navigator'));
    await user.click(screen.getByRole('button', { name: /^Open full window$/i }));

    expect(await screen.findByLabelText('Agent composer')).toBeInTheDocument();
    expect(screen.queryByTestId('compact-shell-toolbar')).not.toBeInTheDocument();
    expect(screen.getByTestId('titlebar-agent-title')).toHaveTextContent('Navigator');
    expect(screen.getByTestId('titlebar-inspector-toggle-slot')).toBeInTheDocument();
    expect(screen.getByTestId('titlebar-inspector-toggle')).toBeInTheDocument();

    await user.click(screen.getByTestId('titlebar-inspector-toggle'));

    await waitFor(() => {
      expect(getContextPanelDialog()).toBeInTheDocument();
      expect(screen.getByTestId('context-panel-overlay')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('context-panel-overlay'));

    await waitFor(() => {
      expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
    });
  });

  it('falls back to the compact toolbar on macOS when native overlay metrics are unavailable', async () => {
    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const toolbar = screen.getByTestId('compact-shell-toolbar');

    expect(
      within(toolbar).getByRole('button', { name: /open sidebar/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('titlebar-sidebar-toggle-slot')).not.toBeInTheDocument();
  });

  it('keeps the compact sidebar toggle in the toolbar on non-macOS', async () => {
    window.duneDesktop = {
      ...window.duneDesktop,
      platform: 'win32',
    };

    setWindowWidth(960);
    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const toolbar = screen.getByTestId('compact-shell-toolbar');

    expect(
      within(toolbar).getByRole('button', { name: /open sidebar/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('titlebar-sidebar-toggle-slot')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('window-drag-region')).queryByRole('button', {
        name: /open sidebar/i,
      }),
    ).not.toBeInTheDocument();
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
    const openAgentButtons = await screen.findAllByRole('button', { name: /^Open agent$/i });
    const firstOpenAgentButton = openAgentButtons[0];

    if (!firstOpenAgentButton) {
      throw new Error('Expected at least one open agent button.');
    }

    await user.click(firstOpenAgentButton);
    await user.click(screen.getByRole('button', { name: /^Open full window$/i }));

    const composer = await screen.findByLabelText('Agent composer');

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
      expect(getContextPanelDialog()).toBeInTheDocument();
      expect(screen.getByTestId('context-panel-overlay')).toBeInTheDocument();
      expect(
        within(getContextPanelDialog()).getByTestId('context-panel'),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('context-panel-overlay'));

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

  it('keeps local input available for externally attached mock agents', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    await agentRuntime.service.createAgent({
      channelId: 'slack',
      externalTarget: {
        channelId: 'slack',
        jid: 'slack:C123',
        kind: 'group',
        name: 'QA Inbox',
      },
      name: 'QA triage',
      projectId: useAppStore.getState().selectedProjectId,
    });

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));
    await user.click(getOpenAgentButton('QA triage'));
    await user.click(screen.getByRole('button', { name: /^Open full window$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'QA triage' })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Agent composer')).toBeEnabled();
  });

  it('deletes a custom agent from the inspector and clears its work item assignments', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    const itemId = useAppStore.getState().items[0]?.id;

    if (!itemId) {
      throw new Error('Expected a seeded work item.');
    }

    await createAgent(user, 'Alpha cleanup');

    const createdAgent = useAppStore.getState().agents.find((agent) => agent.name === 'Alpha cleanup');

    if (!createdAgent) {
      throw new Error('Expected the created agent to exist.');
    }

    act(() => {
      useAppStore.getState().assignPrimaryAgent(itemId, {
        agentId: createdAgent.id,
        agentName: createdAgent.name,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Alpha cleanup' })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^Delete agent$/i }));

    const deleteDialog = await screen.findByRole('dialog', {
      name: /^Delete Alpha cleanup\?$/i,
    });

    await user.click(
      within(deleteDialog).getByRole('button', { name: /^Delete agent$/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /^Agents$/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByText('Alpha cleanup')).not.toBeInTheDocument();
    });

    expect(
      useAppStore.getState().items.find((item) => item.id === itemId)?.primaryAgentId ?? null,
    ).toBeNull();
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
      screen.queryByTestId('context-panel-overlay'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Agent inspector' })).not.toBeInTheDocument();

    setWindowWidth(1300);

    await waitFor(() => {
      expect(getContextPanelDialog()).toBeInTheDocument();
      expect(screen.getByTestId('context-panel-overlay')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('app-shell-layout')).queryByTestId('context-panel'),
      ).not.toBeInTheDocument();
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
      expect(screen.queryByTestId('context-panel-overlay')).not.toBeInTheDocument();
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

  it('supports keyboard resizing on the inline inspector and clamps the width', async () => {
    const user = userEvent.setup();

    render(<AppShell />);
    await createAgent(user, 'Orchestrator');

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
      expect(getContextPanelResizeHandle()).toHaveAttribute(
        'aria-valuenow',
        String(CONTEXT_PANEL_WIDTH_DEFAULT),
      );
    });

    const resizeHandle = getContextPanelResizeHandle();

    expectContextPanelWidth(CONTEXT_PANEL_WIDTH_DEFAULT);

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(CONTEXT_PANEL_WIDTH_DEFAULT + 16),
    );
    expectContextPanelWidth(CONTEXT_PANEL_WIDTH_DEFAULT + 16);

    fireEvent.keyDown(resizeHandle, { key: 'End' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(CONTEXT_PANEL_WIDTH_MAX),
    );

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(CONTEXT_PANEL_WIDTH_MAX),
    );
    expectContextPanelWidth(CONTEXT_PANEL_WIDTH_MAX);

    fireEvent.keyDown(resizeHandle, { key: 'Home' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(CONTEXT_PANEL_WIDTH_MIN),
    );

    fireEvent.keyDown(resizeHandle, { key: 'ArrowRight' });
    expect(resizeHandle).toHaveAttribute(
      'aria-valuenow',
      String(CONTEXT_PANEL_WIDTH_MIN),
    );
    expectContextPanelWidth(CONTEXT_PANEL_WIDTH_MIN);
    expect(window.localStorage.getItem(CONTEXT_PANEL_WIDTH_STORAGE_KEY)).toBe(
      String(CONTEXT_PANEL_WIDTH_MIN),
    );
  });

  it('restores a persisted inspector width across remounts', async () => {
    window.localStorage.setItem(CONTEXT_PANEL_WIDTH_STORAGE_KEY, '344');

    const user = userEvent.setup();
    const firstRender = render(<AppShell />);

    await createAgent(user, 'Orchestrator');
    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    await waitFor(() => {
      expect(getContextPanelResizeHandle()).toHaveAttribute('aria-valuenow', '344');
      expectContextPanelWidth(344);
    });

    firstRender.unmount();

    render(<AppShell />);

    expect(getContextPanelResizeHandle()).toHaveAttribute('aria-valuenow', '344');
    expectContextPanelWidth(344);
  });

  it('uses the saved inspector width in overlay mode without rendering the inline handle', async () => {
    window.localStorage.setItem(CONTEXT_PANEL_WIDTH_STORAGE_KEY, '360');

    const user = userEvent.setup();

    render(<AppShell />);
    await createAgent(user, 'Orchestrator');

    fireEvent.keyDown(window, { key: '\\', metaKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('context-panel')).toBeInTheDocument();
      expect(getContextPanelResizeHandle()).toBeInTheDocument();
      expectContextPanelWidth(360);
    });

    setWindowWidth(1300);

    await waitFor(() => {
      expect(getContextPanelDialog()).toBeInTheDocument();
      expect(screen.getByTestId('context-panel-overlay')).toBeInTheDocument();
      expect(
        within(getContextPanelDialog()).getByTestId('context-panel'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('separator', { name: 'Resize inspector' })).not.toBeInTheDocument();
      expectContextPanelWidth(360);
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

    await user.click(screen.getByRole('button', { name: /create project/i }));
    expect(screen.queryByText('Accent')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Project name'), 'Studio Ops');
    await user.type(
      screen.getByLabelText('Description'),
      'Support the next workflow design pass.',
    );
    await user.click(screen.getByRole('button', { name: /choose folder/i }));
    await user.click(screen.getByRole('button', { name: /^Create project$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Studio Ops' })).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('app-sidebar')).getByRole('button', {
        name: /^Studio Ops$/i,
      }),
    ).toBeInTheDocument();

    const [newWorkItemButton] = screen.getAllByRole('button', { name: /^New work item$/i });

    if (!newWorkItemButton) {
      throw new Error('Expected to find a new work item button.');
    }

    await user.click(newWorkItemButton);
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
    expect(screen.getByText('Project settings')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('workflow-project-board-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-page-scroll')).not.toBeInTheDocument();

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
    expect(screen.getByRole('button', { name: /^Homepage copy rewrite$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Agents$/i }));
    expect(screen.getByTestId('workflow-project-page-scroll')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-board-slot')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Open agent$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Board$/i }));
    expect(screen.getByTestId('workflow-project-board-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-project-page-scroll')).not.toBeInTheDocument();
  });

  it('switches projects from the sidebar list', async () => {
    const user = userEvent.setup();

    render(<AppShell />);

    expect(await screen.findByTestId('workflow-board')).toBeInTheDocument();

    act(() => {
      useAppStore.getState().createProject({
        description: 'Support the calm project shell.',
        name: 'Studio Ops',
        rootPath: null,
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
    await user.click(screen.getByRole('button', { name: /^Open full window$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: 'Homepage copy rewrite agent',
        }),
      ).toBeInTheDocument();
    });
  });

});
