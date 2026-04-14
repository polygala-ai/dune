// Desktop platform hook.

import {
  isMacPlatform,
  platformName,
  primaryModifierLabel,
} from '@/renderer/shared/lib/platform';

/** Desktop platform hook. */
export function useDesktopPlatform() {
  const isMac = isMacPlatform();

  return {
    isMac,
    modifierLabel: primaryModifierLabel(),
    platform: platformName(),
  };
}
