import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  DashboardOutlined,
  UserOutlined,
  HighlightOutlined,
  BarChartOutlined,
  QuestionCircleOutlined,
  DownOutlined,
  SearchOutlined,
  BellOutlined,
  BulbOutlined,
  CrownOutlined,
  PlusOutlined,
  LogoutOutlined,
  SwapOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Input, Badge, Avatar, Button, Dropdown, App, Spin } from "antd";
import { canAccess } from "@/services/permissions";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 主导航配置
 * 一级目录：系统首页、账号管理、内容创作（含二级）、策略中心（含二级）、数据中心、帮助中心
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
    { key: "/templates", label: "模板市场" },
    { key: "/assets", label: "素材库" },
    { key: "/material-categories", label: "素材分类" },
    { key: "/works", label: "我的作品" },
  ],
};

const strategyNav = {
  key: "strategy",
  icon: <BulbOutlined />,
  label: "策略中心",
  children: [
    { key: "/strategy/product-selection", label: "选品策略" },
    { key: "/strategy/social-monitor", label: "社媒监控" },
    { key: "/strategy/topic", label: "营销策略" },
  ],
};

const bottomNav = [
  { key: "/analytics", icon: <BarChartOutlined />, label: "数据中心" },
  { key: "/help", icon: <QuestionCircleOutlined />, label: "帮助中心" },
];

/** 判断内容创作是否处于高亮状态 */
function isContentCreationActive(pathname: string): boolean {
  return ["/templates", "/assets", "/works", "/material-categories"].some((p) =>
    pathname.startsWith(p),
  );
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
  "/assets": "素材库",
  "/material-categories": "素材分类",
  "/works": "我的作品",
  "/strategy/product-selection": "选品策略",
  "/strategy/social-monitor": "社媒监控",
  "/strategy/topic": "营销策略",
  "/analytics": "数据中心",
  "/help": "帮助中心",
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
  const [contentOpen, setContentOpen] = useState(
    isContentCreationActive(location.pathname),
  );
  const [permissionsOpen, setPermissionsOpen] = useState(
    location.pathname.startsWith("/permissions/"),
  );
  const [strategyOpen, setStrategyOpen] = useState(
    isStrategyActive(location.pathname),
  );

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
    <div className="yp-page-shell">
      {/* 左侧边栏 */}
      <aside className="yp-sidebar">
        {/* Logo 区 */}
        <div
          className="flex items-center gap-2.5 px-4"
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
            className="font-semibold text-sm tracking-tight"
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
              <NavLink
                key={item.key}
                to={item.key}
                end={item.key === "/"}
                className={({ isActive }) =>
                  `yp-sidebar-link ${isActive ? "active" : ""}`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}

          {/* 内容创作：可展开分组 */}
          {contentCreationNav.children.some((c) => canAccess(user, c.key)) && (
            <>
              <div className={`yp-sidebar-group ${contentOpen ? "open" : ""}`}>
                <button
                  type="button"
                  className={`yp-sidebar-group-toggle ${contentActive ? "active" : ""}`}
                  onClick={() => setContentOpen(!contentOpen)}
                >
                  <span>
                    {contentCreationNav.icon}
                    <span>{contentCreationNav.label}</span>
                  </span>
                  <DownOutlined className="yp-chevron" />
                </button>
                <div className="yp-sidebar-submenu">
                  {contentCreationNav.children
                    .filter((c) => canAccess(user, c.key))
                    .map((child) => (
                      <NavLink
                        key={child.key}
                        to={child.key}
                        className={({ isActive }) =>
                          `yp-sidebar-subitem ${isActive ? "active" : ""}`
                        }
                      >
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                </div>
              </div>
            </>
          )}
          {/* 策略中心：可展开分组 */}
          {strategyNav.children.some((c) => canAccess(user, c.key)) && (
            <>
              <div className={`yp-sidebar-group ${strategyOpen ? "open" : ""}`}>
                <button
                  type="button"
                  className={`yp-sidebar-group-toggle ${strategyActive ? "active" : ""}`}
                  onClick={() => setStrategyOpen(!strategyOpen)}
                >
                  <span>
                    {strategyNav.icon}
                    <span>{strategyNav.label}</span>
                  </span>
                  <DownOutlined className="yp-chevron" />
                </button>
                <div className="yp-sidebar-submenu">
                  {strategyNav.children
                    .filter((c) => canAccess(user, c.key))
                    .map((child) => (
                      <NavLink
                        key={child.key}
                        to={child.key}
                        className={({ isActive }) =>
                          `yp-sidebar-subitem ${isActive ? "active" : ""}`
                        }
                      >
                        <span>{child.label}</span>
                      </NavLink>
                    ))}
                </div>
              </div>
            </>
          )}
          {bottomNav
            .filter((item) => canAccess(user, item.key))
            .map((item) => (
              <NavLink
                key={item.key}
                to={item.key}
                className={({ isActive }) =>
                  `yp-sidebar-link ${isActive ? "active" : ""}`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          {["roles", "users"].some((k) =>
            canAccess(user, `/permissions/${k}`),
          ) && (
            <div
              className={`yp-sidebar-group ${permissionsOpen ? "open" : ""}`}
            >
              <button
                type="button"
                aria-expanded={permissionsOpen}
                className={`yp-sidebar-group-toggle ${location.pathname.startsWith("/permissions/") ? "active" : ""}`}
                onClick={() => setPermissionsOpen((v) => !v)}
              >
                <span>
                  <SettingOutlined />
                  <span>权限管理</span>
                </span>
                <DownOutlined className="yp-chevron" />
              </button>
              <div className="yp-sidebar-submenu">
                {[
                  { key: "/permissions/roles", label: "角色管理" },
                  { key: "/permissions/users", label: "用户管理" },
                ]
                  .filter((c) => canAccess(user, c.key))
                  .map((c) => (
                    <NavLink
                      key={c.key}
                      to={c.key}
                      className={({ isActive }) =>
                        `yp-sidebar-subitem ${isActive ? "active" : ""}`
                      }
                    >
                      {c.label}
                    </NavLink>
                  ))}
              </div>
            </div>
          )}
        </nav>

        {/* 底部企业版信息卡 */}
        <div
          className="p-4"
          style={{ borderTop: "1px solid var(--yp-border)" }}
        >
          <div
            className="yp-card p-4"
            style={{
              background: "var(--yp-primary-50)",
              borderColor: "var(--yp-primary-100)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: "var(--yp-primary-600)" }}>
                <CrownOutlined />
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--yp-primary-800)" }}
              >
                企业版
              </span>
            </div>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--yp-neutral-600)" }}
            >
              已开通矩阵账号无限绑定权限
            </p>
          </div>
        </div>
      </aside>

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
            <Input
              prefix={
                <SearchOutlined style={{ color: "var(--yp-neutral-400)" }} />
              }
              placeholder="搜索账号、模板、作品"
              style={{ width: 256 }}
            />
            {location.pathname === "/accounts" && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  window.dispatchEvent(new Event("imp-account-create"))
                }
              >
                绑定账号
              </Button>
            )}
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
