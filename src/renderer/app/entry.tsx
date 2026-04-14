// Renderer app entrypoint.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import AppShell from '@/renderer/app/AppShell';

import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found.');
}

createRoot(container).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
