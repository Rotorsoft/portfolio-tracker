import { useState } from "react";
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

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5000 } },
  }));
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({ url: API_URL }),
          false: httpLink({ url: API_URL, headers: getAuthHeaders }),
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
