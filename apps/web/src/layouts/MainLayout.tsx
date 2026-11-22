import type { CSSProperties } from "react";
import SidebarGroup from "@/components/SidebarGroup";
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  DashboardOutlined,
  UserOutlined,
  HighlightOutlined,
  BarChartOutlined,
  QuestionCircleOutlined,
  BellOutlined,
  BulbOutlined,
  LogoutOutlined,
  SwapOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  PictureOutlined,
  VideoCameraOutlined,
  TagsOutlined,
  FolderOpenOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Badge, Avatar, Button, Dropdown, App, Spin, Tooltip } from "antd";
import GlobalSearch from "@/components/GlobalSearch";
import { canAccess } from "@/services/permissions";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 主导航配置
 * 一级目录：系统首页、账号管理、内容创作、策略中心、数据中心、帮助中心、设置
 */
const topNav = [
  { key: "/", icon: <DashboardOutlined />, label: "系统首页" },
  { key: "/accounts", icon: <UserOutlined />, label: "账号管理" },
];

const contentCreationNav = {
  key: "content-creation",
  icon: <HighlightOutlined />,
  label: "内容创作",
  children: [
    { key: "/template-catalog", icon: <FileTextOutlined />, label: "模板列表" },
    { key: "/templates", icon: <AppstoreOutlined />, label: "模板市场" },
    { key: "/assets", icon: <PictureOutlined />, label: "素材库" },
    { key: "/works", icon: <VideoCameraOutlined />, label: "我的作品" },
  ],
};

const settingsNav = [
  {
    key: "/permissions/roles",
    icon: <SafetyCertificateOutlined />,
    label: "角色管理",
  },
  { key: "/permissions/users", icon: <TeamOutlined />, label: "用户管理" },
  { key: "/tags", icon: <TagsOutlined />, label: "标签管理" },
  {
    key: "/material-categories",
    icon: <FolderOpenOutlined />,
    label: "素材分类",
  },
];

function isSettingsActive(pathname: string): boolean {
  return settingsNav.some(
    (item) => pathname === item.key || pathname.startsWith(`${item.key}/`),
  );
}

const strategyNav = {
  key: "strategy",
  icon: <BulbOutlined />,
  label: "策略中心",
  children: [
    {
      key: "/strategy/product-selection",
      icon: <AppstoreOutlined />,
      label: "选品策略",
    },
    {
      key: "/strategy/social-monitor",
      icon: <BarChartOutlined />,
      label: "社媒监控",
    },
    { key: "/strategy/topic", icon: <BulbOutlined />, label: "营销策略" },
  ],
};

const bottomNav = [
  { key: "/analytics", icon: <BarChartOutlined />, label: "数据中心" },
  { key: "/help", icon: <QuestionCircleOutlined />, label: "帮助中心" },
];

/** 判断内容创作是否处于高亮状态 */
function isContentCreationActive(pathname: string): boolean {
  return [
    "/template-catalog",
    "/templates",
    "/assets",
    "/works",
    "/video-editor",
  ].some((p) => pathname.startsWith(p));
}

/** 判断策略中心是否处于高亮状态 */
function isStrategyActive(pathname: string): boolean {
  return [
    "/strategy/product-selection",
    "/strategy/social-monitor",
    "/strategy/topic",
  ].some((p) => pathname.startsWith(p));
}

/** 路由标题映射，用于顶栏展示 */
const pageTitleMap: Record<string, string> = {
  "/": "系统首页",
  "/accounts": "账号管理",
  "/templates": "模板市场",
  "/template-catalog": "模板列表",
  "/assets": "素材库",
  "/material-categories": "素材分类",
  "/works": "我的作品",
  "/tags": "标签管理",
  "/video-editor": "使用模板生成视频",
  "/strategy/product-selection": "选品策略",
  "/strategy/social-monitor": "社媒监控",
  "/strategy/topic": "营销策略",
  "/analytics": "数据中心",
  "/help": "帮助中心",
  "/settings": "账号设置",
  "/permissions/roles": "角色管理",
  "/permissions/users": "用户管理",
};

function getPageTitle(pathname: string): string {
  return pageTitleMap[pathname] || "御品轩智能营销系统";
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { message } = App.useApp();
  useEffect(() => {
    const handler = (event: Event) => {
      message.error((event as CustomEvent<string>).detail);
    };
    window.addEventListener("imp-ui-error", handler);
    return () => window.removeEventListener("imp-ui-error", handler);
  }, [message]);
  const signOut = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "退出失败");
    }
  };
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("imp-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleSidebar = () =>
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem("imp-sidebar-collapsed", String(next));
      } catch {
        /* 不影响本次切换。 */
      }
      return next;
    });
  const [contentOpen, setContentOpen] = useState(
    isContentCreationActive(location.pathname),
  );
  const [settingsOpen, setSettingsOpen] = useState(
    isSettingsActive(location.pathname),
  );
  const [strategyOpen, setStrategyOpen] = useState(
    isStrategyActive(location.pathname),
  );

  useEffect(() => {
    if (isSettingsActive(location.pathname)) setSettingsOpen(true);
  }, [location.pathname]);

  const settingsActive = isSettingsActive(location.pathname);
  const contentActive = isContentCreationActive(location.pathname);
  const strategyActive = isStrategyActive(location.pathname);

  const displayName = user?.name || "运营管理员";
  const displayEmail = user?.phone || "admin@yupinxuan.com";
  const avatarChar = displayName[0] || "管";

  const accountMenuItems = [
    {
      key: "info",
      label: (
        <div style={{ padding: "4px 0", cursor: "default" }}>
          <div
            style={{
              fontWeight: 600,
              color: "var(--yp-neutral-900)",
              fontSize: 14,
            }}
          >
            {displayName}
          </div>
          <div style={{ fontSize: 12, color: "var(--yp-neutral-500)" }}>
            {displayEmail}
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" as const },
    {
      key: "switch",
      icon: <SwapOutlined />,
      label: "切换账号",
      onClick: () => {
        void signOut();
      },
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "账号设置",
      onClick: () => navigate("/settings"),
    },
    { type: "divider" as const },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出账号",
      danger: true,
      onClick: () => {
        void signOut();
      },
    },
  ];

  return (
    <div
      className={`yp-page-shell ${collapsed ? "is-sidebar-collapsed" : ""}`}
      style={
        { "--yp-sidebar-width": collapsed ? "72px" : "240px" } as CSSProperties
      }
    >
      {/* 左侧边栏 */}
      <aside className="yp-sidebar">
        {/* Logo 区 */}
        <div
          className="yp-sidebar-brand flex items-center"
          style={{ height: "var(--yp-topbar-height)" }}
        >
          <img
            src="/images/logo-burgundy.webp"
            alt="御品轩"
            style={{
              height: 36,
              width: 36,
              objectFit: "contain",
              borderRadius: 6,
            }}
          />
          <span
            className="yp-sidebar-label font-semibold text-sm tracking-tight"
            style={{ color: "var(--yp-neutral-900)" }}
          >
            御品轩智能营销系统
          </span>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {topNav
            .filter((item) => canAccess(user, item.key))
            .map((item) => (
              <Tooltip
                key={item.key}
                title={collapsed ? item.label : undefined}
                placement="right"
              >
                <NavLink
                  to={item.key}
                  end={item.key === "/"}
                  className={({ isActive }) =>
                    `yp-sidebar-link ${isActive ? "active" : ""}`
                  }
                >
                  {item.icon}
                  <span className="yp-sidebar-label">{item.label}</span>
                </NavLink>
              </Tooltip>
            ))}

          {contentCreationNav.children.some((item) =>
            canAccess(user, item.key),
          ) && (
            <SidebarGroup
              id="content-creation"
              label={contentCreationNav.label}
              icon={contentCreationNav.icon}
              items={contentCreationNav.children.filter((item) =>
                canAccess(user, item.key),
              )}
              collapsed={collapsed}
              open={contentOpen}
              active={contentActive}
              onToggle={() => setContentOpen((value) => !value)}
            />
          )}
          {strategyNav.children.some((item) => canAccess(user, item.key)) && (
            <SidebarGroup
              id="strategy"
              label={strategyNav.label}
              icon={strategyNav.icon}
              items={strategyNav.children.filter((item) =>
                canAccess(user, item.key),
              )}
              collapsed={collapsed}
              open={strategyOpen}
              active={strategyActive}
              onToggle={() => setStrategyOpen((value) => !value)}
            />
          )}
          {bottomNav
            .filter((item) => canAccess(user, item.key))
            .map((item) => (
              <Tooltip
                key={item.key}
                title={collapsed ? item.label : undefined}
                placement="right"
              >
                <NavLink
                  to={item.key}
                  className={({ isActive }) =>
                    `yp-sidebar-link ${isActive ? "active" : ""}`
                  }
                >
                  {item.icon}
                  <span className="yp-sidebar-label">{item.label}</span>
                </NavLink>
              </Tooltip>
            ))}
          {settingsNav.some((item) => canAccess(user, item.key)) && (
            <SidebarGroup
              id="settings"
              label="设置"
              icon={<SettingOutlined />}
              items={settingsNav.filter((item) => canAccess(user, item.key))}
              collapsed={collapsed}
              open={settingsOpen}
              active={settingsActive}
              onToggle={() => setSettingsOpen((value) => !value)}
            />
          )}
        </nav>

      </aside>

      <Tooltip
        title={collapsed ? "展开导航" : "收起导航"}
        placement="bottom"
      >
        <Button
          type="text"
          className="yp-sidebar-collapse"
          onClick={toggleSidebar}
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          aria-label={collapsed ? "展开导航" : "收起导航"}
          aria-expanded={!collapsed}
        />
      </Tooltip>

      {/* 右侧主区域 */}
      <div className="yp-main-area">
        {/* 顶部导航栏 */}
        <header className="yp-topbar">
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--yp-neutral-900)" }}
          >
            {getPageTitle(location.pathname)}
          </h1>
          <div className="flex items-center gap-4">
            <GlobalSearch />
            <Badge count={3} size="small">
              <button
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  color: "var(--yp-neutral-600)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--yp-neutral-100)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <BellOutlined />
              </button>
            </Badge>
            <Dropdown
              menu={{ items: accountMenuItems }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <div
                className="flex items-center gap-3 pl-4"
                style={{
                  borderLeft: "1px solid var(--yp-border)",
                  cursor: "pointer",
                }}
              >
                <div className="text-right hidden sm:block">
                  <div
                    className="text-sm font-medium"
                    style={{ color: "var(--yp-neutral-800)" }}
                  >
                    {displayName}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--yp-neutral-500)" }}
                  >
                    {displayEmail}
                  </div>
                </div>
                <Avatar
                  className="font-semibold text-sm"
                  style={{
                    background: "var(--yp-primary-100)",
                    color: "var(--yp-primary-700)",
                    border: "1px solid var(--yp-primary-200)",
                  }}
                >
                  {avatarChar}
                </Avatar>
              </div>
            </Dropdown>
          </div>
        </header>

        {/* 页面内容 */}
        <div className="yp-page-content">
          <div className="yp-content-wrapper">
            <Suspense
              fallback={
                <div className="p-8 text-center">
                  <Spin />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
