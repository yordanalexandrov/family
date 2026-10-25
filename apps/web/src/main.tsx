import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createQueryClient } from './app/query-client';
import { createAppRouter } from './app/router';
import { applyStoredTheme } from './app/theme';
import './styles/tokens.css';
import './styles/global.css';

applyStoredTheme();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <App router={createAppRouter()} queryClient={createQueryClient()} />
  </StrictMode>,
);
