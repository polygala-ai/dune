import {
  isMacPlatform,
  platformName,
  primaryModifierLabel,
} from '@/renderer/shared/lib/platform';

export function useDesktopPlatform() {
  const isMac = isMacPlatform();

  return {
    isMac,
    modifierLabel: primaryModifierLabel(),
    platform: platformName(),
  };
}
