import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { createId } from '@/shared/id';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import {
  deleteModelProviderSecret,
  loadModelProviders,
  readModelProviderSecret,
  saveModelProviders,
  type ModelAuthType,
  type ModelProvider,
  writeModelProviderSecret,
} from '@/renderer/features/settings/model/model-providers';
import { Button } from '@/renderer/shared/ui/button';
import { cn } from '@/renderer/shared/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Input } from '@/renderer/shared/ui/input';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const STORE_NAME = 'settings';
const SECRETS_STORE_NAME = 'secrets';

function maskSecret(key: string) {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

interface DefaultSwitchProps {
  checked: boolean;
  onToggle: () => void;
  providerName: string;
}

function DefaultSwitch({ checked, onToggle, providerName }: DefaultSwitchProps) {
  return (
    <button
      aria-checked={checked}
      aria-label={`Default provider ${providerName}`}
      className={cn(
        'focus-ring-app inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors focus-visible:outline-none focus-visible:ring-2',
        checked
          ? 'border-app-accent/40 bg-app-accent/12 text-app-text'
          : 'border-app-border bg-app-panel text-app-muted hover:border-app-border-strong hover:text-app-text',
      )}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span>Default</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-app-accent' : 'bg-app-border',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

function createBridgeStore(storeName: string) {
  return {
    delete: async (key: string) => {
      await window.duneDesktop?.storageDelete?.(storeName, key);
    },
    get: async <T,>(key: string): Promise<T | null> => {
      const value = await window.duneDesktop?.storageGet?.(storeName, key);
      return (value as T | null | undefined) ?? null;
    },
    set: async <T,>(key: string, value: T) => {
      await window.duneDesktop?.storageSet?.(storeName, key, value);
    },
  };
}

const settingsStore = createBridgeStore(STORE_NAME);
const secretsStore = createBridgeStore(SECRETS_STORE_NAME);

function findDefaultProviderId(providers: ModelProvider[]) {
  return providers.find((provider) => provider.isDefault)?.id ?? null;
}

async function loadProvidersWithSecrets() {
  const providers = await loadModelProviders({ secretsStore, settingsStore });
  const secrets = Object.fromEntries(
    await Promise.all(
      providers.map(async (provider) => [
        provider.id,
        await readModelProviderSecret(secretsStore, provider.id),
      ]),
    ),
  );

  return { providers, secrets };
}

interface ProviderFormProps {
  initial?: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    secret: string;
  };
  onCancel: () => void;
  onSave: (data: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    secret: string;
  }) => void;
}

function ProviderForm({ initial, onCancel, onSave }: ProviderFormProps) {
  const [form, setForm] = useState(initial ?? {
    authType: 'api-key' as ModelAuthType,
    baseUrl: '',
    name: '',
    secret: '',
  });
  const secretLabel = form.authType === 'oauth-token' ? 'Claude Code OAuth token' : 'API key';
  const canSave = form.authType === 'oauth-token'
    ? form.name.trim() && form.secret.trim()
    : form.name.trim() && form.baseUrl.trim() && form.secret.trim();

  return (
    <section className="rounded-[20px] border border-app-accent/30 bg-app-card/60 p-5">
      <div className="space-y-3">
        <select
          aria-label="Auth type"
          className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
          onChange={(e) => setForm({
            ...form,
            authType: e.target.value as ModelAuthType,
            baseUrl: e.target.value === 'oauth-token' ? '' : form.baseUrl,
          })}
          value={form.authType}
        >
          <option value="api-key">API key</option>
          <option value="oauth-token">OAuth token</option>
        </select>
        <Input
          autoFocus
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Provider name (e.g. OpenAI)"
          value={form.name}
        />
        {form.authType === 'api-key' ? (
          <Input
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder="Base URL (e.g. https://api.openai.com/v1)"
            value={form.baseUrl}
          />
        ) : null}
        <Input
          onChange={(e) => setForm({ ...form, secret: e.target.value })}
          placeholder={secretLabel}
          type="password"
          value={form.secret}
        />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          disabled={!canSave}
          onClick={() => onSave({
            authType: form.authType,
            baseUrl: form.authType === 'oauth-token' ? '' : form.baseUrl.trim(),
            name: form.name.trim(),
            secret: form.secret.trim(),
          })}
          type="button"
        >
          Save
        </Button>
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </section>
  );
}

export function ModelsSettings(props: SettingsSectionComponentProps) {
  void props;
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [providerSecrets, setProviderSecrets] = useState<Record<string, string>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isRestartDialogOpen, setRestartDialogOpen] = useState(false);

  useEffect(() => {
    loadProvidersWithSecrets()
      .then(({ providers, secrets }) => {
        setProviders(providers);
        setProviderSecrets(secrets);
      })
      .catch((err) => console.error('Failed to load providers:', err));
  }, []);

  const persist = async (next: ModelProvider[], nextSecrets: Record<string, string> = providerSecrets) => {
    const persistedProviders = await saveModelProviders(settingsStore, next);
    setProviders(persistedProviders);
    setProviderSecrets(nextSecrets);
  };

  const handleAdd = async (data: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    secret: string;
  }) => {
    const id = createId('provider');
    await writeModelProviderSecret(secretsStore, id, data.secret);
    await persist([...providers, {
      authType: data.authType,
      baseUrl: data.baseUrl,
      id,
      isDefault: false,
      name: data.name,
    }], {
      ...providerSecrets,
      [id]: data.secret,
    });
    setIsAdding(false);
  };

  const handleUpdate = async (id: string, data: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    secret: string;
  }) => {
    await writeModelProviderSecret(secretsStore, id, data.secret);
    await persist(
      providers.map((p) => (p.id === id ? {
        ...p,
        authType: data.authType,
        baseUrl: data.baseUrl,
        name: data.name,
      } : p)),
      {
        ...providerSecrets,
        [id]: data.secret,
      },
    );
    setEditingId(null);
  };

  const handleToggleDefault = async (id: string) => {
    const previousDefaultId = findDefaultProviderId(providers);
    const nextProviders = providers.map((provider) => ({
      ...provider,
      isDefault: provider.id === id ? !provider.isDefault : false,
    }));
    const nextDefaultId = findDefaultProviderId(nextProviders);

    await persist(nextProviders);

    if (
      previousDefaultId !== nextDefaultId &&
      typeof window.duneDesktop?.restartApp === 'function'
    ) {
      setRestartDialogOpen(true);
    }
  };

  const handleRemove = async (id: string) => {
    await deleteModelProviderSecret(secretsStore, id);
    const nextSecrets = { ...providerSecrets };
    delete nextSecrets[id];
    await persist(providers.filter((p) => p.id !== id), nextSecrets);
  };

  return (
    <>
      <SettingsSectionIntro
        description="Add LLM providers to use with your agents."
        eyebrow="Models"
        title="Providers"
      />

      <div className="mt-6 space-y-3">
        {providers.map((provider) =>
          editingId === provider.id ? (
            <ProviderForm
              initial={{
                authType: provider.authType,
                name: provider.name,
                baseUrl: provider.baseUrl,
                secret: providerSecrets[provider.id] ?? '',
              }}
              key={provider.id}
              onCancel={() => setEditingId(null)}
              onSave={(data) => void handleUpdate(provider.id, data)}
            />
          ) : (
            <section
              className="rounded-[20px] border border-app-border bg-app-card/60 p-5"
              data-testid={`provider-card-${provider.id}`}
              key={provider.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-app-text">{provider.name}</h3>
                    <span className="pill-key shrink-0">
                      {provider.authType === 'oauth-token' ? 'OAuth token' : 'API key'}
                    </span>
                    <DefaultSwitch
                      checked={provider.isDefault}
                      onToggle={() => void handleToggleDefault(provider.id)}
                      providerName={provider.name}
                    />
                  </div>
                  {provider.baseUrl ? (
                    <p className="mt-1 font-mono text-xs text-app-muted">{provider.baseUrl}</p>
                  ) : null}
                  <p className="mt-1 font-mono text-xs text-app-muted">
                    {providerSecrets[provider.id]
                      ? maskSecret(providerSecrets[provider.id] ?? '')
                      : 'No secret saved'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    onClick={() => setEditingId(provider.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  <Button
                    aria-label={`Remove ${provider.name}`}
                    onClick={() => void handleRemove(provider.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </section>
          ),
        )}

        {isAdding ? (
          <ProviderForm onCancel={() => setIsAdding(false)} onSave={(data) => void handleAdd(data)} />
        ) : (
          <Button
            onClick={() => setIsAdding(true)}
            type="button"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            Add provider
          </Button>
        )}
      </div>

      <Dialog open={isRestartDialogOpen}>
        <DialogContent
          className="w-[min(92vw,520px)]"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle>Restart to enable the new default model</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            The new default provider has been saved. Restart the app to enable it for
            AgentLite.
          </DialogDescription>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              onClick={() => setRestartDialogOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void window.duneDesktop?.restartApp?.();
              }}
              type="button"
            >
              Restart
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
