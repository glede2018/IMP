import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { App as AntApp } from "antd";
import { menuKey } from "@/services/permissions";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchMe,
  request,
  save,
  ApiError,
  advanceSessionGeneration,
  currentSessionGeneration,
} from "@/services/api";
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
  const { message } = AntApp.useApp();
  const userRef = useRef<UserInfo | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const refresh = async () => {
    const generation = currentSessionGeneration();
    setLoading(true);
    setError(null);
    try {
      const current = await fetchMe();
      if (generation === currentSessionGeneration()) setUser(current);
    } catch (e) {
      if (generation !== currentSessionGeneration()) return;
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401))
        setError(e instanceof Error ? e.message : "无法连接服务器");
    } finally {
      if (generation === currentSessionGeneration()) setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const expired = (event: Event) => {
      if (userRef.current) {
        const reason = (event as CustomEvent<string>).detail;
        void message.warning({
          key: "session-expired",
          content: reason || "登录已失效，请重新登录；同一账号仅允许一处登录",
        });
      }
      advanceSessionGeneration();
      userRef.current = null;
      setLoading(false);
      setUser(null);
      setError(null);
      queryClient.clear();
    };
    window.addEventListener("imp-session-expired", expired);
    return () => window.removeEventListener("imp-session-expired", expired);
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    // 页面可见时定期校验会话，切回窗口立即校验，及时响应其他设备的新登录。
    let stopped = false;
    const check = () => {
      if (document.visibilityState === "hidden") return;
      const generation = currentSessionGeneration();
      void fetchMe()
        .then((current) => {
          if (
            !stopped &&
            generation === currentSessionGeneration() &&
            userRef.current?.id === current.id
          )
            setUser(current);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [user?.id]);
  const login = async (phone: string, password: string) => {
    const u = await save<UserInfo>(
      "/auth/login",
      /^1[3-9]\d{9}$/.test(phone)
        ? { phone, password }
        : { account: phone, password },
    );
    advanceSessionGeneration();
    queryClient.clear();
    setLoading(false);
    setError(null);
    userRef.current = u;
    setUser(u);
  };
  const logout = async () => {
    await request("/auth/logout", { method: "POST" });
    advanceSessionGeneration();
    userRef.current = null;
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
