import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { externalChannelOptions } from '@/renderer/features/agents/model/channels';
import { Button } from '@/renderer/shared/ui/button';

import { SettingsSectionIntro } from './SettingsSectionIntro';

export function ChannelsSettings(props: SettingsSectionComponentProps) {
  void props;

  return (
    <>
      <SettingsSectionIntro
        description="Connect external channels that agents can attach to later. Dune chat is built in and used automatically by default."
        eyebrow="Channels"
        title="External channel catalog"
      />

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
