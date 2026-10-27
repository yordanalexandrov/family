import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useServerEvents } from '../api/events';
import type { AppRouter } from './router';

interface AppProps {
  router: AppRouter;
  queryClient: QueryClient;
}

/** Сигналите за промени от api-то, веднъж за цялото приложение. */
function ServerEvents() {
  useServerEvents();
  return null;
}

export function App({ router, queryClient }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ServerEvents />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
