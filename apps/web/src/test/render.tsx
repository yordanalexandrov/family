import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { App } from '../app/App';
import { createQueryClient } from '../app/query-client';
import { createAppRouter } from '../app/router';

/** Рендерира цялото приложение (router + query) върху history в памет. */
export function renderApp(path = '/') {
  const queryClient = createQueryClient({ retry: false });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  const view = render(<App router={router} queryClient={queryClient} />);
  return { ...view, router, queryClient };
}
