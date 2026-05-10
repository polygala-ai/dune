// Models settings UI.

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { createId } from '@/shared/id';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import {
  type ModelAuthType,
  type ModelProvider,
  type ModelProviderKind,
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

/** Masks secret. */
function maskSecret(key: string) {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/** Returns provider kind label. */
function providerKindLabel(providerKind: ModelProviderKind) {
  return providerKind === 'openai' ? 'OpenAI' : 'Anthropic';
}

/** Default switch props. */
interface DefaultSwitchProps {
  checked: boolean;
  onToggle: () => void;
  providerName: string;
}

/** Renders the default switch UI. */
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

/** Finds default provider ID. */
function findDefaultProviderId(providers: ModelProvider[]) {
  return providers.find((provider) => provider.isDefault)?.id ?? null;
}

/** Loads providers with secrets. */
async function loadProvidersWithSecrets() {
  const providers = await window.duneDesktop?.loadModelProviders?.();
  if (!providers) {
    throw new Error('Desktop settings API is unavailable.');
  }
  const secrets = Object.fromEntries(
    await Promise.all(
      providers.map(async (provider) => [
        provider.id,
        await window.duneDesktop?.readModelProviderSecret?.(provider.id) ?? '',
      ]),
    ),
  );

  return { providers, secrets };
}

/** Provider form props. */
interface ProviderFormProps {
  initial?: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    providerKind: ModelProviderKind;
    secret: string;
  };
  onCancel: () => void;
  onSave: (data: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    providerKind: ModelProviderKind;
    secret: string;
  }) => void;
}

/** Renders the provider form UI. */
function ProviderForm({ initial, onCancel, onSave }: ProviderFormProps) {
  const [form, setForm] = useState(initial ?? {
    authType: 'api-key' as ModelAuthType,
    baseUrl: '',
    name: '',
    providerKind: 'openai' as ModelProviderKind,
    secret: '',
  });
  const secretLabel = form.authType === 'oauth-token'
    ? 'Claude Code OAuth token'
    : form.providerKind === 'openai'
      ? 'OpenAI API key'
      : 'Anthropic API key';
  const canSave = form.authType === 'oauth-token'
    ? form.name.trim() && form.secret.trim()
    : form.name.trim() && form.secret.trim();

  return (
    <section className="rounded-[20px] border border-app-accent/30 bg-app-card/60 p-5">
      <div className="space-y-3">
        <select
          aria-label="Provider type"
          className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
          disabled={form.authType === 'oauth-token'}
          onChange={(e) => setForm({
            ...form,
            providerKind: e.target.value as ModelProviderKind,
          })}
          value={form.providerKind}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <select
          aria-label="Auth type"
          className="focus-ring-app h-11 w-full rounded-[16px] border border-app-border bg-app-panel px-4 py-2 text-sm text-app-text outline-none transition-colors focus-visible:border-app-border-strong focus-visible:ring-2"
          onChange={(e) => setForm({
            ...form,
            authType: e.target.value as ModelAuthType,
            baseUrl: e.target.value === 'oauth-token' ? '' : form.baseUrl,
            providerKind: e.target.value === 'oauth-token' ? 'anthropic' : form.providerKind,
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
            placeholder="Base URL (optional)"
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
            providerKind: form.authType === 'oauth-token' ? 'anthropic' : form.providerKind,
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

/** Renders the models settings UI. */
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

  /** Persists . */
  const persist = async (next: ModelProvider[], nextSecrets: Record<string, string> = providerSecrets) => {
    const persistedProviders = await window.duneDesktop?.saveModelProviders?.(next);
    if (!persistedProviders) {
      throw new Error('Desktop settings API is unavailable.');
    }
    setProviders(persistedProviders);
    setProviderSecrets(nextSecrets);
  };

  /** Handles add. */
  const handleAdd = async (data: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    providerKind: ModelProviderKind;
    secret: string;
  }) => {
    const id = createId('provider');
    await window.duneDesktop?.writeModelProviderSecret?.(id, data.secret);
    await persist([...providers, {
      authType: data.authType,
      baseUrl: data.baseUrl,
      id,
      isDefault: false,
      name: data.name,
      providerKind: data.providerKind,
    }], {
      ...providerSecrets,
      [id]: data.secret,
    });
    setIsAdding(false);
  };

  /** Handles update. */
  const handleUpdate = async (id: string, data: {
    authType: ModelAuthType;
    baseUrl: string;
    name: string;
    providerKind: ModelProviderKind;
    secret: string;
  }) => {
    await window.duneDesktop?.writeModelProviderSecret?.(id, data.secret);
    await persist(
      providers.map((p) => (p.id === id ? {
        ...p,
        authType: data.authType,
        baseUrl: data.baseUrl,
        name: data.name,
        providerKind: data.providerKind,
      } : p)),
      {
        ...providerSecrets,
        [id]: data.secret,
      },
    );
    setEditingId(null);
  };

  /** Handles default toggle. */
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

  /** Handles remove. */
  const handleRemove = async (id: string) => {
    await window.duneDesktop?.deleteModelProviderSecret?.(id);
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
                providerKind: provider.providerKind,
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
                      {providerKindLabel(provider.providerKind)}
                    </span>
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
