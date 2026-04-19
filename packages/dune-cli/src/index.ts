import { parseArgs } from 'node:util';

import { resolveDuneAuthConfig } from './auth';
import {
  renderAgentsTable,
  renderItemDetails,
  renderItemsTable,
} from './format';
import { DuneLocalClient } from './local-client';

interface GlobalOptions {
  help: boolean;
  json: boolean;
  userDataDir: string | undefined;
}

function printHelp(): void {
  console.log([
    'Dune CLI',
    '',
    'Usage:',
    '  dune items list [--project <id-or-name>] [--json]',
    '  dune items create <title> [--brief <text>] [--status <status>] [--project <id-or-name>] [--json]',
    '  dune items move <item-id> <status> [--json]',
    '  dune items show <item-id> [--json]',
    '  dune agents list [--project <id-or-name>] [--json]',
    '  dune feedback <item-id> <message> [--json]',
    '',
    'Global options:',
    '  --json',
    '  --user-data-dir <path>',
    '',
    'Auth:',
    '  DUNE_API_KEY or ~/.dune/config',
  ].join('\n'));
}

function parseGlobalOptions(args: string[]): GlobalOptions {
  const { values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
      },
      json: {
        type: 'boolean',
      },
      'user-data-dir': {
        type: 'string',
      },
    },
    strict: false,
  });

  return {
    help: values.help === true,
    json: values.json === true,
    userDataDir:
      typeof values['user-data-dir'] === 'string' ? values['user-data-dir'] : undefined,
  };
}

function renderOutput(result: unknown, options: { json: boolean; human: string }): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(options.human);
}

function requirePositional(positionals: string[], index: number, label: string): string {
  const value = positionals[index]?.trim();

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp();
    return;
  }

  const auth = resolveDuneAuthConfig();
  const globalOptions = parseGlobalOptions(argv);
  void auth;

  const client = new DuneLocalClient(
    globalOptions.userDataDir ? { userDataDir: globalOptions.userDataDir } : {},
  );

  const [primaryCommand, secondaryCommand, ...rest] = argv;

  if (primaryCommand === '--help' || globalOptions.help) {
    printHelp();
    return;
  }

  if (primaryCommand === 'items') {
    if (secondaryCommand === 'list') {
      const { values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          json: {
            type: 'boolean',
          },
          project: {
            type: 'string',
          },
          'user-data-dir': {
            type: 'string',
          },
        },
      });
      const items = await client.listItems(values.project);

      renderOutput(items, {
        human: renderItemsTable(items),
        json: values.json === true,
      });
      return;
    }

    if (secondaryCommand === 'create') {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          brief: {
            type: 'string',
          },
          json: {
            type: 'boolean',
          },
          project: {
            type: 'string',
          },
          status: {
            type: 'string',
          },
          title: {
            type: 'string',
          },
          'user-data-dir': {
            type: 'string',
          },
        },
      });
      const title = values.title ?? positionals.join(' ').trim();

      if (!title) {
        throw new Error('Title is required for `dune items create`.');
      }

      const item = await client.createItem({
        ...(typeof values.brief === 'string' ? { brief: values.brief } : {}),
        ...(typeof values.project === 'string' ? { project: values.project } : {}),
        ...(typeof values.status === 'string' ? { status: values.status } : {}),
        title,
      });

      renderOutput(item, {
        human: renderItemsTable([item]),
        json: values.json === true,
      });
      return;
    }

    if (secondaryCommand === 'move') {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          json: {
            type: 'boolean',
          },
          'user-data-dir': {
            type: 'string',
          },
        },
      });
      const itemId = requirePositional(positionals, 0, 'Item id');
      const status = requirePositional(positionals, 1, 'Status');
      const item = await client.moveItem(itemId, status);

      renderOutput(item, {
        human: renderItemsTable([item]),
        json: values.json === true,
      });
      return;
    }

    if (secondaryCommand === 'show') {
      const { positionals, values } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          json: {
            type: 'boolean',
          },
          'user-data-dir': {
            type: 'string',
          },
        },
      });
      const itemId = requirePositional(positionals, 0, 'Item id');
      const item = await client.showItem(itemId);

      renderOutput(item, {
        human: renderItemDetails(item),
        json: values.json === true,
      });
      return;
    }

    throw new Error(`Unknown items command: ${secondaryCommand ?? '(missing)'}.`);
  }

  if (primaryCommand === 'agents') {
    if (secondaryCommand !== 'list') {
      throw new Error(`Unknown agents command: ${secondaryCommand ?? '(missing)'}.`);
    }

    const { values } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        json: {
          type: 'boolean',
        },
        project: {
          type: 'string',
        },
        'user-data-dir': {
          type: 'string',
        },
      },
    });
    const agents = await client.listAgents(values.project);

    renderOutput(agents, {
      human: renderAgentsTable(agents),
      json: values.json === true,
    });
    return;
  }

  if (primaryCommand === 'feedback') {
    const { positionals, values } = parseArgs({
      args: [secondaryCommand ?? '', ...rest],
      allowPositionals: true,
      options: {
        json: {
          type: 'boolean',
        },
        'user-data-dir': {
          type: 'string',
        },
      },
    });
    const itemId = requirePositional(positionals, 0, 'Item id');
    const message = positionals.slice(1).join(' ').trim();

    if (!message) {
      throw new Error('Feedback message is required.');
    }

    const item = await client.addFeedback(itemId, message);

    renderOutput(item, {
      human: renderItemsTable([item]),
      json: values.json === true,
    });
    return;
  }

  throw new Error(`Unknown command: ${primaryCommand ?? '(missing)'}.`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
