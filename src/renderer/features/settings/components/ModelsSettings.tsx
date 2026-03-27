import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import type { ModelProvider } from '@/renderer/features/settings/types';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';

import { SettingsSectionIntro } from './SettingsSectionIntro';

const STORE_NAME = 'settings';
const STORE_KEY = 'modelProviders';

async function loadProviders(): Promise<ModelProvider[]> {
  const data = await window.duneDesktop?.storageGet?.(STORE_NAME, STORE_KEY);
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is ModelProvider =>
      typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).id === 'string',
  );
}

async function saveProviders(providers: ModelProvider[]) {
  await window.duneDesktop?.storageSet?.(STORE_NAME, STORE_KEY, providers);
}

function maskApiKey(key: string) {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

interface ProviderFormProps {
  initial?: { name: string; baseUrl: string; apiKey: string };
  onCancel: () => void;
  onSave: (data: { name: string; baseUrl: string; apiKey: string }) => void;
}

function ProviderForm({ initial, onCancel, onSave }: ProviderFormProps) {
  const [form, setForm] = useState(initial ?? { name: '', baseUrl: '', apiKey: '' });
  const canSave = form.name.trim() && form.baseUrl.trim() && form.apiKey.trim();

  return (
    <section className="rounded-[20px] border border-app-accent/30 bg-app-card/60 p-5">
      <div className="space-y-3">
        <Input
          autoFocus
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Provider name (e.g. OpenAI)"
          value={form.name}
        />
        <Input
          onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          placeholder="Base URL (e.g. https://api.openai.com/v1)"
          value={form.baseUrl}
        />
        <Input
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder="API key"
          type="password"
          value={form.apiKey}
        />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          disabled={!canSave}
          onClick={() => onSave({
            name: form.name.trim(),
            baseUrl: form.baseUrl.trim(),
            apiKey: form.apiKey.trim(),
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
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadProviders()
      .then(setProviders)
      .catch((err) => console.error('Failed to load providers:', err));
  }, []);

  const persist = (next: ModelProvider[]) => {
    setProviders(next);
    saveProviders(next).catch((err) => console.error('Failed to save providers:', err));
  };

  const handleAdd = (data: { name: string; baseUrl: string; apiKey: string }) => {
    persist([...providers, {
      id: crypto.randomUUID(),
      name: data.name,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      enabled: true,
    }]);
    setIsAdding(false);
  };

  const handleUpdate = (id: string, data: { name: string; baseUrl: string; apiKey: string }) => {
    persist(providers.map((p) => (p.id === id ? { ...p, ...data } : p)));
    setEditingId(null);
  };

  const handleToggle = (id: string) => {
    persist(providers.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  const handleRemove = (id: string) => {
    persist(providers.filter((p) => p.id !== id));
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
                name: provider.name,
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
              }}
              key={provider.id}
              onCancel={() => setEditingId(null)}
              onSave={(data) => handleUpdate(provider.id, data)}
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
                    <button
                      className="pill-key shrink-0 cursor-pointer border-transparent"
                      onClick={() => handleToggle(provider.id)}
                      type="button"
                    >
                      {provider.enabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-xs text-app-muted">{provider.baseUrl}</p>
                  <p className="mt-1 font-mono text-xs text-app-muted">
                    {maskApiKey(provider.apiKey)}
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
                    onClick={() => handleRemove(provider.id)}
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
          <ProviderForm onCancel={() => setIsAdding(false)} onSave={handleAdd} />
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
    </>
  );
}
