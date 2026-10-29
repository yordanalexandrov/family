import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { registerAppUpdate } from './app/app-update';
import { applyStoredEffects } from './app/effects';
import { listenForInstallPrompt } from './app/install-prompt';
import { createQueryClient } from './app/query-client';
import { createAppRouter } from './app/router';
import { applyStoredTheme } from './app/theme';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';

applyStoredTheme();
applyStoredEffects();
listenForInstallPrompt();
if (import.meta.env.PROD) {
  registerAppUpdate();
}

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <App router={createAppRouter()} queryClient={createQueryClient()} />
  </StrictMode>,
);
