"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { API_BASE } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => void;
}

const TOKEN_KEY = "ib-auth-token";
const AuthCtx = createContext<AuthState | null>(null);

/** Read the stored bearer token (for authenticated API calls elsewhere). */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate the session from a stored token on first mount.
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("session invalid");
        const d = await r.json();
        setUser(d.user as AuthUser);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const submit = useCallback(
    async (path: "login" | "register", body: Record<string, unknown>) => {
      const res = await fetch(`${API_BASE}/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(data?.message)
          ? data.message[0]
          : data?.message;
        throw new Error(msg || "Something went wrong. Please try again.");
      }
      window.localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user as AuthUser);
    },
    [],
  );

  const signIn = useCallback(
    (email: string, password: string) => submit("login", { email, password }),
    [submit],
  );
  const signUp = useCallback(
    (email: string, password: string, name?: string) =>
      submit("register", { email, password, name }),
    [submit],
  );
  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
