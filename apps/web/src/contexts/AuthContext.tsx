import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { menuKey } from "@/services/permissions";
import { useQueryClient } from "@tanstack/react-query";
import { fetchMe, request, save, ApiError } from "@/services/api";
import type { UserInfo } from "@/types";
interface AuthValue {
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
  isLoggedIn: boolean;
  canWrite: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setUser(await fetchMe());
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401))
        setError(e instanceof Error ? e.message : "无法连接服务器");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const expired = () => {
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("imp-session-expired", expired);
    return () => window.removeEventListener("imp-session-expired", expired);
  }, []);
  const login = async (phone: string, password: string) => {
    const u = await save<UserInfo>(
      "/auth/login",
      /^1[3-9]\d{9}$/.test(phone)
        ? { phone, password }
        : { account: phone, password },
    );
    queryClient.clear();
    setError(null);
    setUser(u);
  };
  const logout = async () => {
    await request("/auth/logout", { method: "POST" });
    setUser(null);
    queryClient.clear();
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isLoggedIn: !!user,
        canWrite:
          !!user &&
          user.permissions.some((p) => p === "*" || p.endsWith(":write")),
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Missing AuthProvider");
  const { pathname } = useLocation();
  const key = menuKey(pathname);
  return {
    ...value,
    canWrite:
      !!value.user &&
      value.user.permissions.some((p) => p === "*" || p === `${key}:write`),
  };
}
