import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Input, Button, Select, InputNumber, message } from 'antd';
import { UserOutlined, PhoneOutlined, SafetyOutlined, HomeOutlined } from '@ant-design/icons';

/**
 * 注册页
 * 字段：姓名、性别、年龄、所属公司/门店、手机号、验证码
 * 通信云验证码接口预留 TODO
 */
export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();

  const initialPhone = (location.state as { phone?: string })?.phone || '';

  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [age, setAge] = useState<number | null>(null);
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [loading] = useState(false);
  const [codeLoading] = useState(false);
  const [countdown] = useState(0);

  const handleSendCode = () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      message.warning('请输入正确的手机号');
      return;
    }
    message.info('短信注册尚未接入，请联系管理员开通账号。');
  };

  const handleRegister = () => {
    if (!name) {
      message.warning('请输入姓名');
      return;
    }
    if (!gender) {
      message.warning('请选择性别');
      return;
    }
    if (!age || age < 18 || age > 99) {
      message.warning('请输入有效年龄');
      return;
    }
    if (!company) {
      message.warning('请输入所属公司/门店');
      return;
    }
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      message.warning('请输入正确的手机号');
      return;
    }
    if (!code) {
      message.warning('请输入验证码');
      return;
    }

    message.info('注册尚未接入，请联系管理员开通账号。');
  };

  return (
    <main className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-4 py-8">
      {/* 工厂照片背景 — 虚化 + 高斯模糊 */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: 'url(/images/factory.webp)',
          filter: 'blur(8px) saturate(120%)',
          transform: 'scale(1.08)',
        }}
      />
      {/* 明亮渐变遮罩 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 247, 237, 0.78) 0%, rgba(254, 215, 170, 0.55) 40%, rgba(255, 237, 213, 0.72) 100%)',
        }}
      />

      <section className="relative z-10 w-full max-w-[460px]">
        <div
          className="rounded-2xl p-8 md:p-10"
          style={{
            background: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(16px) saturate(160%)',
            WebkitBackdropFilter: 'blur(16px) saturate(160%)',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            boxShadow: '0 16px 48px rgba(234, 88, 12, 0.10), 0 4px 16px rgba(0, 0, 0, 0.06)',
          }}
        >
          {/* 品牌 Logo */}
          <header className="mb-6 text-center">
            <img
              src="/images/logo-burgundy.webp"
              alt="御品轩"
              className="mx-auto mb-3"
              style={{ height: 48, objectFit: 'contain' }}
            />
            <h1 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: 'var(--yp-neutral-900)' }}>
              注册账号
            </h1>
            <p className="text-sm" style={{ color: 'var(--yp-neutral-500)' }}>
              填写以下信息完成注册
            </p>
          </header>

          <div className="space-y-4">
            {/* 姓名 */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--yp-neutral-900)' }}>
                姓名
              </label>
              <Input
                size="large"
                prefix={<UserOutlined style={{ color: 'var(--yp-neutral-400)' }} />}
                placeholder="请输入姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* 性别 + 年龄 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--yp-neutral-900)' }}>
                  性别
                </label>
                <Select
                  size="large"
                  placeholder="请选择"
                  style={{ width: '100%' }}
                  value={gender || undefined}
                  onChange={(v) => setGender(v)}
                  options={[
                    { value: 'male', label: '男' },
                    { value: 'female', label: '女' },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--yp-neutral-900)' }}>
                  年龄
                </label>
                <InputNumber
                  size="large"
                  placeholder="请输入"
                  style={{ width: '100%' }}
                  min={18}
                  max={99}
                  value={age}
                  onChange={(v) => setAge(v)}
                />
              </div>
            </div>

            {/* 所属公司/门店 */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--yp-neutral-900)' }}>
                所属公司/门店
              </label>
              <Input
                size="large"
                prefix={<HomeOutlined style={{ color: 'var(--yp-neutral-400)' }} />}
                placeholder="请输入所属公司或门店名称"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>

            {/* 手机号 */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--yp-neutral-900)' }}>
                手机号
              </label>
              <Input
                size="large"
                prefix={<PhoneOutlined style={{ color: 'var(--yp-neutral-400)' }} />}
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={11}
              />
            </div>

            {/* 验证码 */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--yp-neutral-900)' }}>
                验证码
              </label>
              <div className="flex gap-3">
                <Input
                  size="large"
                  prefix={<SafetyOutlined style={{ color: 'var(--yp-neutral-400)' }} />}
                  placeholder="请输入验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                />
                <Button
                  size="large"
                  style={{ minWidth: 120 }}
                  disabled={countdown > 0}
                  loading={codeLoading}
                  onClick={handleSendCode}
                >
                  {countdown > 0 ? `${countdown}s 后重发` : '获取验证码'}
                </Button>
              </div>
            </div>

            {/* 注册按钮 */}
            <Button
              type="primary"
              size="large"
              block
              loading={loading}
              onClick={handleRegister}
              style={{ marginTop: 8 }}
            >
              注册并登录
            </Button>
          </div>

          <p className="mt-6 text-center text-xs" style={{ color: 'var(--yp-neutral-500)' }}>
            已有账号？
            <a
              onClick={() => navigate('/login')}
              style={{ color: 'var(--yp-primary-600)', marginLeft: 4, cursor: 'pointer' }}
            >
              返回登录
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
