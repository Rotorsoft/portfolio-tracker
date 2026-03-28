import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "../trpc.js";

type AuthUser = { id: string; name: string; role: "admin" | "user" };

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, name: string, password: string) => Promise<void>;
  signOut: () => void;
  isAdmin: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.login.useMutation();
  const signupMutation = trpc.signup.useMutation();
  const meQuery = trpc.me.useQuery(undefined, {
    enabled: !!localStorage.getItem(TOKEN_KEY),
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data as AuthUser);
      setLoading(false);
    } else if (meQuery.isError || !localStorage.getItem(TOKEN_KEY)) {
      if (meQuery.isError) {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      }
      setLoading(false);
    }
  }, [meQuery.data, meQuery.isError]);

  const signIn = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const result = await loginMutation.mutateAsync({ username, password });
      localStorage.setItem(TOKEN_KEY, result.token);
      setUser(result.user as AuthUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    }
  }, [loginMutation]);

  const signUp = useCallback(async (username: string, name: string, password: string) => {
    setError(null);
    try {
      const result = await signupMutation.mutateAsync({ username, name, password });
      localStorage.setItem(TOKEN_KEY, result.token);
      setUser(result.user as AuthUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed");
    }
  }, [signupMutation]);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, isAdmin: user?.role === "admin", error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
