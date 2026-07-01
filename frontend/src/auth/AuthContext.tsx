import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  getAuthToken,
  login as apiLogin,
  logout as apiLogout,
  setAuthToken,
  signup as apiSignup,
  type SignupPayload,
} from "../api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  oauthError: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Replace the cached user after a profile/photo change. */
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Reads (and strips) a #token=… / #oauth_error=… fragment left by the OAuth
 *  callback redirect, so a social login lands the user straight into the app. */
function consumeOAuthHash(): { token?: string; error?: string } {
  if (typeof window === "undefined" || !window.location.hash) return {};
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("token") ?? undefined;
  const error = params.get("oauth_error") ?? undefined;
  if (token || error) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return { token, error };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const { token, error } = consumeOAuthHash();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (error) setOauthError(error);
    if (token) setAuthToken(token);

    const active = token ?? getAuthToken();
    if (!active) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((me) => setUserState(me))
      .catch(() => setAuthToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await apiLogin(email, password);
    setUserState(u);
  }, []);

  const signup = useCallback(async (payload: SignupPayload) => {
    const { user: u } = await apiSignup(payload);
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUserState(null);
  }, []);

  const setUser = useCallback((u: User) => setUserState(u), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, oauthError, login, signup, logout, setUser }),
    [user, loading, oauthError, login, signup, logout, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
