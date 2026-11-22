import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, Popover } from "antd";
import { DownOutlined } from "@ant-design/icons";

export type SidebarItem = { key: string; label: string; icon?: ReactNode };

export default function SidebarGroup({
  id,
  label,
  icon,
  items,
  collapsed,
  open,
  active,
  onToggle,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  items: SidebarItem[];
  collapsed: boolean;
  open: boolean;
  active: boolean;
  onToggle: () => void;
}) {
  const { pathname } = useLocation();
  const [popupOpen, setPopupOpen] = useState(false);
  const button = (
    <button
      type="button"
      className={`yp-sidebar-group-toggle ${active ? "active" : ""}`}
      aria-label={label}
      aria-expanded={collapsed ? undefined : open}
      aria-controls={collapsed ? undefined : `${id}-submenu`}
      onClick={collapsed ? undefined : onToggle}
    >
      <span>
        {icon}
        <span className="yp-sidebar-label">{label}</span>
      </span>
      <DownOutlined className="yp-chevron" />
    </button>
  );
  return (
    <div className={`yp-sidebar-group ${!collapsed && open ? "open" : ""}`}>
      {collapsed ? (
        <Popover
          placement="rightTop"
          title={label}
          trigger={["hover", "click"]}
          mouseEnterDelay={0.12}
          open={popupOpen}
          onOpenChange={setPopupOpen}
          content={
            <Menu
              selectedKeys={[pathname]}
              onClick={() => setPopupOpen(false)}
              style={{ minWidth: 160, borderInlineEnd: 0 }}
              items={items.map((item) => ({
                key: item.key,
                icon: item.icon,
                label: <NavLink to={item.key}>{item.label}</NavLink>,
              }))}
            />
          }
        >
          {button}
        </Popover>
      ) : (
        button
      )}
      <div
        id={`${id}-submenu`}
        className="yp-sidebar-submenu"
        aria-hidden={collapsed || !open}
        {...(collapsed || !open ? { inert: "" } : {})}
      >
        <div>
          {items.map((item) => (
            <NavLink
              key={item.key}
              to={item.key}
              className={({ isActive }) =>
                `yp-sidebar-subitem ${isActive ? "active" : ""}`
              }
            >
              <span className="yp-sidebar-label">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
