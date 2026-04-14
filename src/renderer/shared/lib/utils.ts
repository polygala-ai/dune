// Renderer utility helpers.

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Cns. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
