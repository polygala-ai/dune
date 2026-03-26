import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { externalChannelOptions } from '@/renderer/features/agents/model/channels';
import { Button } from '@/renderer/shared/ui/button';

import { SettingsSectionIntro } from './SettingsSectionIntro';

export function ChannelsSettings({
  runtimeInfo,
}: SettingsSectionComponentProps) {
  const runtimeLabel = runtimeInfo.mode === 'real' ? 'Real AgentLite' : 'Mock fallback';

  return (
    <>
      <SettingsSectionIntro
        description="Connect external channels that agents can attach to later. Dune chat is built in and used automatically by default."
        eyebrow="Channels"
        title="External channel catalog"
      />

      <section className="mt-6 rounded-[20px] border border-app-border bg-app-panel/60 p-5">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-app-text">Runtime status</h3>
          <span className="pill-key shrink-0">{runtimeLabel}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          {runtimeInfo.message}
        </p>
        {runtimeInfo.rootPath ? (
          <p className="mt-2 font-mono text-[11px] leading-5 text-app-muted">
            {runtimeInfo.rootPath}
          </p>
        ) : null}
      </section>

      <div className="mt-6 space-y-3">
        {externalChannelOptions.map((channel) => (
          <section
            className="rounded-[20px] border border-app-border bg-app-card/60 p-5"
            key={channel.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-app-text">{channel.label}</h3>
                <p className="mt-2 text-sm leading-6 text-app-muted">
                  {channel.description}
                </p>
              </div>
              <span className="pill-key shrink-0">Soon</span>
            </div>

            <div className="mt-4">
              <Button disabled type="button" variant="outline">
                Configure
              </Button>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
