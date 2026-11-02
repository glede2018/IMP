import { useState } from 'react';
import { Card, Tag, Button } from 'antd';
import {
  RiseOutlined,
  GiftOutlined,
  FireOutlined,
  EnvironmentOutlined,
  AppstoreOutlined,
  CrownOutlined,
  HomeOutlined,
  TeamOutlined,
  EyeOutlined,
  BulbOutlined,
} from '@ant-design/icons';

/**
 * 营销内容选题策略页
 * Tab 切换 + 整体趋势分析 + 选题推荐卡片 + 内容形态建议 + 参考案例
 */
export default function TopicStrategy() {
  const [activeTab, setActiveTab] = useState('seasonal');

  const tabs = [
    { key: 'seasonal', label: '季节趋势' },
    { key: 'competitor', label: '竞品借鉴' },
    { key: 'ingredient', label: '原料特色' },
    { key: 'marketing', label: '营销理念' },
  ];

  const topicCards = [
    { title: '秋日板栗吐司开箱', desc: '聚焦新品板栗吐司的包装、切面、口感层次，配合秋日暖色调场景，提升新品认知与种草转化。', icon: <GiftOutlined />, platforms: ['抖音', '小红书'] },
    { title: '门店现烤南瓜贝果', desc: '记录南瓜贝果从揉面、醒发到出炉的全过程，突出"现烤现卖"与"秋季限定"两大卖点。', icon: <FireOutlined />, platforms: ['抖音', '快手'] },
    { title: '中秋礼盒复购指南', desc: '针对中秋后余货与复购场景，输出"礼盒拆吃+二次创意吃法"内容，延长节日产品生命周期。', icon: <GiftOutlined />, platforms: ['小红书', '快手'] },
    { title: '节后低糖轻食系列', desc: '围绕节后健康诉求，推荐全麦、低糖、高纤类产品，输出"好吃不胖"的场景化解决方案。', icon: <EnvironmentOutlined />, platforms: ['抖音', '小红书'] },
  ];

  const formats = [
    { icon: <AppstoreOutlined />, title: '开箱测评', desc: '适合新品、礼盒、季节限定' },
    { icon: <CrownOutlined />, title: '制作教程', desc: '突出工艺、原料、现烤优势' },
    { icon: <HomeOutlined />, title: '场景化种草', desc: '早餐、下午茶、节日送礼' },
    { icon: <TeamOutlined />, title: '门店纪实', desc: '真实门店氛围、员工故事' },
  ];

  const cases = [
    { title: '拉丝牛角包教程', platform: '抖音', stat: '播放量 245.8w', desc: '通过特写拉丝画面与简单步骤，激发用户模仿与购买欲望。' },
    { title: '门店现烤全流程揭秘', platform: '快手', stat: '播放量 189.2w', desc: '以第一视角记录清晨备料，强化"新鲜出炉"品牌心智。' },
    { title: '中秋限定礼盒开箱', platform: '小红书', stat: '点赞 12.5w', desc: '高颜值礼盒拆箱+口味测评，评论区种草转化效果明显。' },
  ];

  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>营销策略</h1>
        <p>基于季节、竞品、原料、营销理念四个方向输出选题推荐</p>
      </div>

      {/* 方向标签栏 */}
      <div className="yp-tab-bar" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, background: 'var(--yp-neutral-100)', borderRadius: 'var(--yp-radius-md, 10px)', width: 'fit-content' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`yp-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: activeTab === t.key ? 'var(--yp-primary-600)' : 'var(--yp-neutral-600)',
              borderRadius: 'var(--yp-radius-sm, 6px)',
              cursor: 'pointer',
              border: 'none',
              background: activeTab === t.key ? 'var(--yp-card)' : 'transparent',
              boxShadow: activeTab === t.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 整体趋势分析 */}
      <Card variant="borderless" styles={{ body: { padding: 20 } }}>
        <div className="flex items-center gap-2 mb-3">
          <RiseOutlined style={{ fontSize: 20, color: 'var(--yp-primary-600)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>整体趋势分析</h2>
        </div>
        <p style={{ fontSize: 14, color: 'var(--yp-neutral-600)', lineHeight: 1.7, margin: 0 }}>
          当前正值秋季烘焙旺季，消费者对于温暖、治愈、节日氛围类内容的关注度显著提升。结合御品轩产品矩阵，建议重点围绕"秋日限定""栗子南瓜""中秋礼盒复盘""节后轻食"等关键词展开内容布局；抖音侧重场景化短视频与教程，小红书侧重开箱测评与高颜值图文，快手侧重真实门店记录与福利直播切片。
        </p>
      </Card>

      {/* 选题推荐卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {topicCards.map((c) => (
          <Card key={c.title} variant="borderless" styles={{ body: { padding: 16 } }} className="yp-topic-card" hoverable>
            <div className="flex items-center justify-between mb-2">
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>{c.title}</h3>
              <span style={{ color: 'var(--yp-primary-600)' }}>{c.icon}</span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--yp-neutral-600)', margin: '0 0 12px 0' }}>{c.desc}</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {c.platforms.map((p) => (
                <Tag key={p} className="yp-tag-primary">{p}</Tag>
              ))}
            </div>
            <a
              href="#/templates"
              style={{ fontSize: 13, color: 'var(--yp-primary-600)', fontWeight: 500 }}
              onClick={(e) => { e.preventDefault(); window.location.hash = '#/templates'; }}
            >
              应用到模板
            </a>
          </Card>
        ))}
      </div>

      {/* 内容形态建议与参考案例 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 内容形态建议 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }}>
          <div className="flex items-center gap-2 mb-4">
            <AppstoreOutlined style={{ fontSize: 20, color: 'var(--yp-primary-600)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>推荐内容形态</h2>
          </div>
          {formats.map((f, i) => (
            <div
              key={f.title}
              className="flex items-center gap-3"
              style={{ padding: '12px 0', borderBottom: i < formats.length - 1 ? '1px solid var(--yp-border)' : 'none' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--yp-primary-100)', color: 'var(--yp-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </Card>

        {/* 参考案例 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }} className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <EyeOutlined style={{ fontSize: 20, color: 'var(--yp-primary-600)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>参考爆款案例</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cases.map((c) => (
              <Card key={c.title} variant="borderless" styles={{ body: { padding: 16 } }} className="yp-case-card">
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)', marginBottom: 8 }}>{c.title}</div>
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="yp-tag-neutral">{c.platform}</Tag>
                  <span style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>{c.stat}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--yp-neutral-600)', margin: 0, lineHeight: 1.6 }}>{c.desc}</p>
              </Card>
            ))}
          </div>
        </Card>
      </div>

      {/* 生成按钮 */}
      <div className="flex justify-center">
        <Button type="primary" size="large" icon={<BulbOutlined />}>
          生成选题推荐
        </Button>
      </div>
    </div>
  );
}
