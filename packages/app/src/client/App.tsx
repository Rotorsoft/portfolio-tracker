import { useState, useCallback, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpLink, splitLink, httpSubscriptionLink } from "@trpc/client";
import { trpc } from "./trpc.js";
import { AuthProvider } from "./hooks/useAuth.js";
import { Shell } from "./components/Shell.js";

const API_URL = "http://localhost:4000";

function getAuthHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Server connectivity store
let _serverDown = false;
const _listeners = new Set<() => void>();
function setServerDown(v: boolean) {
  if (_serverDown !== v) { _serverDown = v; _listeners.forEach((l) => l()); }
}
export function useServerDown() {
  return useSyncExternalStore(
    useCallback((cb: () => void) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; }, []),
    () => _serverDown,
  );
}

// Wrapped fetch that tracks connectivity
const connectivityFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init);
    setServerDown(false);
    return res;
  } catch (err) {
    setServerDown(true);
    throw err;
  }
};

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 5000,
        retry: (failureCount, error) => {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return failureCount < 2;
          return failureCount < 3;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      },
    },
  }));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({ url: API_URL }),
          false: httpLink({ url: API_URL, headers: getAuthHeaders, fetch: connectivityFetch }),
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
