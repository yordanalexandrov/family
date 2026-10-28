import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useServerEvents } from '../api/events';
import { usePushFollowsActingUser } from '../features/settings/push';
import type { AppRouter } from './router';

interface AppProps {
  router: AppRouter;
  queryClient: QueryClient;
}

/** Сигналите за промени от api-то и абонаментът за известия след смяна на потребителя, веднъж за приложението. */
function ServerEvents() {
  useServerEvents();
  usePushFollowsActingUser();
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
