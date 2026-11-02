import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { Alert, Button, Spin, Result } from "antd";
import { lazy, type ReactNode } from "react";
import MainLayout from "@/layouts/MainLayout";
const Home = lazy(() => import("@/pages/Home"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Templates = lazy(() => import("@/pages/Templates"));
const MaterialCategories = lazy(() => import("@/pages/MaterialCategories"));
const Assets = lazy(() => import("@/pages/Assets"));
const Works = lazy(() => import("@/pages/Works"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const HelpCenter = lazy(() => import("@/pages/HelpCenter"));
const Permissions = lazy(() => import("@/pages/Permissions"));
const Settings = lazy(() => import("@/pages/Settings"));
import Login from "@/pages/Login";
const VideoEditor = lazy(() => import("@/pages/VideoEditor"));
const ProductSelection = lazy(() => import("@/pages/ProductSelection"));
const SocialMonitor = lazy(() => import("@/pages/SocialMonitor"));
const TopicStrategy = lazy(() => import("@/pages/TopicStrategy"));
import Register from "@/pages/Register";
import { canAccess } from "@/services/permissions";
import { useAuth } from "@/contexts/AuthContext";
function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, isLoggedIn, loading, error, refresh } = useAuth();
  if (loading)
    return (
      <div className="p-12 text-center">
        <Spin />
      </div>
    );
  if (error)
    return (
      <div className="p-12">
        <Alert
          type="error"
          message={error}
          action={<Button onClick={() => void refresh()}>重试</Button>}
        />
      </div>
    );
  if (isLoggedIn && location.pathname === "/" && !canAccess(user, "/")) {
    const first = [
      "/accounts",
      "/templates",
      "/assets",
      "/works",
      "/analytics",
      "/help",
      "/permissions/roles",
      "/permissions/users",
      "/strategy/product-selection",
      "/strategy/social-monitor",
      "/strategy/topic",
    ].find((path) => canAccess(user, path));
    if (first) return <Navigate to={first} replace />;
  }
  if (isLoggedIn && !canAccess(user, location.pathname))
    return (
      <Result
        status="403"
        title="暂无此页面访问权限"
        subTitle="请联系管理员分配角色"
        extra={<Button onClick={() => window.history.back()}>返回</Button>}
      />
    );
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />;
}
export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: "accounts", element: <Accounts /> },
      { path: "assets", element: <Assets /> },
      { path: "material-categories", element: <MaterialCategories /> },
      { path: "templates", element: <Templates /> },
      { path: "works", element: <Works /> },
      { path: "video-editor", element: <VideoEditor /> },
      { path: "strategy/product-selection", element: <ProductSelection /> },
      { path: "strategy/social-monitor", element: <SocialMonitor /> },
      { path: "strategy/topic", element: <TopicStrategy /> },
      { path: "analytics", element: <Analytics /> },
      { path: "help", element: <HelpCenter /> },
      {
        path: "organization",
        element: <Navigate to="/permissions/users" replace />,
      },
      { path: "permissions/roles", element: <Permissions kind="roles" /> },
      { path: "permissions/users", element: <Permissions kind="users" /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
