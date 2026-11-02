import { useEffect, useState } from 'react';
import { Tag, Button } from 'antd';
import {
  UserOutlined,
  PlusCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { fetchDashboardMetrics, fetchWorks, statusMap } from '@/services/ui-api';
import { reportError } from '@/services/ui-api';
import type { DashboardMetrics, Work } from '@/types/ui';
import { Link } from 'react-router-dom';

/**
 * 系统首页
 * 展示运营数据概览与最新动态，对应 Design 原型 page-home
 */
export default function Home() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentWorks, setRecentWorks] = useState<Work[]>([]);

  useEffect(() => {
    // TODO: 后续可合并为单个聚合接口 GET /api/home/summary
    fetchDashboardMetrics().then(setMetrics).catch(reportError);
    fetchWorks().then((data) => setRecentWorks(data.slice(0, 5))).catch(reportError);
  }, []);

  const today = new Date();
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const dateStr = `今天是 ${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日，${weekDays[today.getDay()]}`;

  const kpiCards = [
    {
      title: '矩阵账号总数',
      value: metrics?.totalAccounts ?? 0,
      suffix: '个',
      delta: '—',
      icon: <UserOutlined />,
      iconBg: 'var(--yp-primary-100)',
      iconColor: 'var(--yp-primary-700)',
    },
    {
      title: '今日新增作品',
      value: metrics?.todayWorks ?? 0,
      suffix: '',
      delta: '—',
      icon: <PlusCircleOutlined />,
      iconBg: 'var(--yp-primary-100)',
      iconColor: 'var(--yp-primary-700)',
    },
    {
      title: '待分发作品',
      value: '—',
      suffix: '',
      delta: '—',
      icon: <ClockCircleOutlined />,
      iconBg: 'var(--yp-state-warning-bg)',
      iconColor: 'var(--yp-state-warning)',
    },
    {
      title: '近7天总播放量',
      value: metrics?.totalViews !== undefined ? (metrics.totalViews / 1000).toFixed(1) : '—',
      suffix: 'K',
      delta: '—',
      icon: <PlayCircleOutlined />,
      iconBg: 'var(--yp-state-success-bg)',
      iconColor: 'var(--yp-state-success)',
    },
  ];

  const quickEntries = [
    { label: '矩阵账号管理', desc: `管理 ${metrics?.totalAccounts ?? 0} 个矩阵账号`, to: '/accounts', icon: <UserOutlined /> },
    { label: 'AI 模板市场', desc: `浏览 ${metrics?.totalTemplates ?? 0} 个可用模板`, to: '/templates', icon: <PlusCircleOutlined /> },
    { label: '数据看板大盘', desc: '查看全平台数据', to: '/analytics', icon: <PlayCircleOutlined /> },
  ];

  return (
    <div className="space-y-6">
      {/* 欢迎头部 */}
      <div className="yp-page-header">
        <h1>欢迎回来，运营同学 👋</h1>
        <p>{dateStr}</p>
      </div>

      {/* KPI 指标卡 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpiCards.map((card) => (
          <div key={card.title} className="yp-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="yp-text-sm" style={{ color: 'var(--yp-neutral-500)' }}>
                {card.title}
              </span>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: card.iconBg, color: card.iconColor }}
              >
                {card.icon}
              </div>
            </div>
            <div className="yp-text-3xl yp-font-bold" style={{ color: 'var(--yp-neutral-900)' }}>
              {card.value}
              <span className="yp-text-lg yp-font-medium ml-1">{card.suffix}</span>
            </div>
            <div className="yp-text-xs mt-1" style={{ color: 'var(--yp-neutral-500)' }}>
              {card.delta}
            </div>
          </div>
        ))}
      </div>

      {/* 两栏内容：最近作品 + 快捷入口 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 最近生成作品 */}
        <div className="yp-card lg:col-span-2">
          <div
            className="flex items-center justify-between"
            style={{ padding: '16px 20px', borderBottom: '1px solid var(--yp-border)' }}
          >
            <h3 className="yp-text-lg yp-font-semibold" style={{ color: 'var(--yp-neutral-900)' }}>
              最近生成作品
            </h3>
            <Link to="/works">
              <Button type="link" icon={<ArrowRightOutlined />}>
                查看全部
              </Button>
            </Link>
          </div>
          <div className="p-2">
            {recentWorks.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 rounded-lg transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--yp-neutral-50)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div
                  className="w-16 h-10 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--yp-primary-100)', color: 'var(--yp-primary-700)' }}
                >
                  <PlayCircleOutlined />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="yp-text-sm yp-font-medium truncate"
                    style={{ color: 'var(--yp-neutral-900)' }}
                  >
                    {item.title}
                  </p>
                  <p className="yp-text-xs" style={{ color: 'var(--yp-neutral-500)' }}>
                    {item.platform ? `平台：${item.platform}` : '未指定平台'} · {item.createdAt}
                  </p>
                </div>
                <Tag
                  color={statusMap[item.status].color}
                >
                  {statusMap[item.status].label}
                </Tag>
                <span
                  className="yp-text-xs text-right w-20"
                  style={{ color: 'var(--yp-neutral-500)' }}
                >
                  {item.createdAt}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 快捷入口 */}
        <div className="yp-card">
          <div
            style={{ padding: '16px 20px', borderBottom: '1px solid var(--yp-border)' }}
          >
            <h3 className="yp-text-lg yp-font-semibold" style={{ color: 'var(--yp-neutral-900)' }}>
              快捷入口
            </h3>
          </div>
          <div className="p-5 space-y-3">
            {quickEntries.map((entry) => (
              <Link
                key={entry.label}
                to={entry.to}
                className="flex items-center gap-4 p-4 rounded-lg transition-colors block"
                style={{ border: '1px solid var(--yp-border)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--yp-primary)';
                  e.currentTarget.style.background = 'var(--yp-primary-50)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--yp-border)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                  style={{ background: 'var(--yp-primary-100)', color: 'var(--yp-primary-700)' }}
                >
                  {entry.icon}
                </div>
                <div className="flex-1">
                  <p
                    className="yp-text-sm yp-font-medium"
                    style={{ color: 'var(--yp-neutral-900)' }}
                  >
                    {entry.label}
                  </p>
                  <p className="yp-text-xs" style={{ color: 'var(--yp-neutral-500)' }}>
                    {entry.desc}
                  </p>
                </div>
                <ArrowRightOutlined style={{ color: 'var(--yp-neutral-400)' }} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
