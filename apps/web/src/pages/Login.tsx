import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Button, message } from "antd";
import {
  UserOutlined,
  LockOutlined,
  EyeInvisibleOutlined,
  EyeTwoTone,
} from "@ant-design/icons";
import { useAuth } from "@/contexts/AuthContext";

/**
 * 登录页
 * 工厂照片作为全屏背景（暗色渐变遮罩），毛玻璃登录卡片
 */
export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) {
      message.warning("请输入账号或手机号和密码");
      return;
    }
    setLoading(true);
    try {
      await login(phone, password);
      message.success("登录成功");
      navigate("/", { replace: true });
    } catch (e) {
      message.error(e instanceof Error ? e.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-4"
      style={{
        background:
          "linear-gradient(135deg, #FFFBF7 0%, #FFF7ED 40%, #FED7AA 100%)",
      }}
    >
      {/* 工厂照片 — 右下角，清晰展示，渐变过渡到背景 */}
      <div
        className="absolute right-0 bottom-0 bg-cover bg-no-repeat"
        style={{
          width: "55%",
          height: "70%",
          backgroundImage: "url(/images/factory.webp)",
          backgroundPosition: "center",
          maskImage:
            "linear-gradient(225deg, rgba(0,0,0,1) 30%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage:
            "linear-gradient(225deg, rgba(0,0,0,1) 30%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0) 100%)",
        }}
      />
      {/* 左上角暖光渐变，与右下角照片对称 */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: "50%",
          height: "50%",
          background:
            "radial-gradient(circle at top left, rgba(254, 186, 122, 0.35) 0%, transparent 70%)",
        }}
      />

      <section className="relative z-10 w-full max-w-[420px]">
        {/* 毛玻璃登录卡片 */}
        <div
          className="rounded-2xl p-8 md:p-10"
          style={{
            background: "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(16px) saturate(160%)",
            WebkitBackdropFilter: "blur(16px) saturate(160%)",
            border: "1px solid rgba(255, 255, 255, 0.7)",
            boxShadow:
              "0 16px 48px rgba(234, 88, 12, 0.10), 0 4px 16px rgba(0, 0, 0, 0.06)",
          }}
        >
          {/* 品牌 Logo */}
          <header className="mb-8 text-center">
            <img
              src="/images/logo-burgundy.webp"
              alt="御品轩"
              className="mx-auto mb-4"
              style={{ height: 56, objectFit: "contain" }}
            />
            <p
              className="text-sm tracking-wider"
              style={{ color: "var(--yp-neutral-500)", letterSpacing: "0.1em" }}
            >
              智能营销系统
            </p>
          </header>

          {/* 表单 */}
          <div className="space-y-5">
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--yp-neutral-900)" }}
              >
                账号 / 手机号
              </label>
              <Input
                id="phone"
                autoComplete="username"
                size="large"
                prefix={
                  <UserOutlined style={{ color: "var(--yp-neutral-400)" }} />
                }
                placeholder="请输入账号或手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onPressEnter={handleLogin}
                maxLength={50}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--yp-neutral-900)" }}
              >
                密码
              </label>
              <Input.Password
                id="password"
                autoComplete="current-password"
                size="large"
                prefix={
                  <LockOutlined style={{ color: "var(--yp-neutral-400)" }} />
                }
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onPressEnter={handleLogin}
                iconRender={(visible) =>
                  visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />
                }
              />
            </div>
            <Button
              type="primary"
              size="large"
              block
              loading={loading}
              onClick={handleLogin}
            >
              登录
            </Button>
          </div>
          <div className="mt-6 text-center">
            <span
              className="text-sm"
              style={{ color: "var(--yp-neutral-500)" }}
            >
              还没有账号？
            </span>
            <Button type="link" onClick={() => navigate("/register")}>
              立即注册
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
