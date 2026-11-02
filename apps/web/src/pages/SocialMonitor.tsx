import { useState } from 'react';
import { Card, Tag, Select, Button, Checkbox } from 'antd';
import {
  RadarChartOutlined,
  FireOutlined,
  BulbOutlined,
  RiseOutlined,
  FundOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const { Option } = Select;

/**
 * 社媒监控页
 * 平台筛选 + 竞品品牌 + 时间范围 + 6 个监控卡片
 */
export default function SocialMonitor() {
  const [platforms, setPlatforms] = useState<string[]>(['douyin', 'xiaohongshu']);

  const platformPills = [
    { key: 'douyin', label: '抖音' },
    { key: 'kuaishou', label: '快手' },
    { key: 'xiaohongshu', label: '小红书' },
    { key: 'shipinhao', label: '视频号' },
  ];

  const competitorActivities = [
    { brand: '好利来', color: 'var(--yp-state-warning)', platform: '小红书', content: '发布「联名款半熟芝士」系列，互动量 12.8w', time: '2小时前' },
    { brand: '鲍师傅', color: 'var(--yp-state-error)', platform: '抖音', content: '开启「肉松小贝」直播专场，GMV 预估 86w', time: '5小时前' },
    { brand: '奈雪的茶', color: 'var(--yp-state-info)', platform: '视频号', content: '推出「秋日烘焙套餐」短视频，转发 3.2w', time: '昨日' },
  ];

  const hotProducts = [
    { name: '半熟芝士', tag: '爆款', tagClass: 'yp-tag-error', heat: 98.5, source: '好利来 · 抖音月销 4.2w 件' },
    { name: '肉松小贝', tag: '上升', tagClass: 'yp-tag-warning', heat: 86.2, source: '鲍师傅 · 快手直播 TOP1' },
    { name: '芋泥雪贝', tag: '稳定', tagClass: 'yp-tag-info', heat: 74.6, source: '仟吉 · 小红书种草 1.8w 篇' },
    { name: '欧包礼盒', tag: '新品', tagClass: 'yp-tag-success', heat: 68.3, source: '奈雪的茶 · 视频号首发' },
  ];

  const successFactors = [
    { title: '强视觉冲击 + 仪式感呈现', desc: '切开的流心、拉丝过程提升完播率 35%' },
    { title: 'IP 联名制造话题稀缺感', desc: '限定款引发收藏与社交分享欲望' },
    { title: '「现烤现卖」信任背书', desc: '门店后厨直播增强新鲜度感知' },
    { title: 'UGC 二创激励机制', desc: '达人探店与开箱挑战扩大传播' },
  ];

  const opportunities = [
    { title: '低糖/健康烘焙', priority: '高优先级', priorityClass: 'yp-tag-error', desc: '小红书「控糖烘焙」搜索量周环比 +42%，竞品布局较少' },
    { title: '节日伴手礼场景', priority: '中优先级', priorityClass: 'yp-tag-warning', desc: '中秋/国庆礼盒内容缺口明显，可提前 2 周布局' },
    { title: '早餐速食面包', priority: '中优先级', priorityClass: 'yp-tag-warning', desc: '抖音「早餐吃什么」话题热度高，可推出 9.9 元套餐' },
    { title: '本地生活团购', priority: '新机会', priorityClass: 'yp-tag-success', desc: '视频号本地流量扶持，门店短视频团购转化提升空间大' },
  ];

  const platformTrends = [
    { platform: '抖音', color: '#1C1C1C', heat: 98.2, topic: '#烘焙店沉浸式做蛋糕', desc: '播放量 4.8 亿 · 适合门店 IP 跟拍' },
    { platform: '小红书', color: '#FF2442', heat: 92.7, topic: '#秋日限定甜品测评', desc: '笔记 12.6w 篇 · 适合测评种草内容' },
    { platform: '快手', color: '#FF6600', heat: 85.4, topic: '#老式糕点复兴', desc: '直播场均 GMV 增长 28% · 适合怀旧产品线' },
    { platform: '视频号', color: '#07C160', heat: 78.9, topic: '#早安烘焙电台', desc: '中老年用户互动高 · 适合早餐场景内容' },
  ];

  const togglePlatform = (key: string) => {
    setPlatforms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>社媒监控</h1>
        <p>AI 抓取竞品动态与行业热点，输出监控报告</p>
      </div>

      {/* 筛选栏 */}
      <Card variant="borderless" styles={{ body: { padding: 16 } }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)', whiteSpace: 'nowrap' }}>平台筛选</span>
            {platformPills.map((p) => (
              <label
                key={p.key}
                className={`yp-checkbox-pill ${platforms.includes(p.key) ? 'checked' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <Checkbox
                  checked={platforms.includes(p.key)}
                  onChange={() => togglePlatform(p.key)}
                >
                  {p.label}
                </Checkbox>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)', whiteSpace: 'nowrap' }}>竞品品牌</span>
            <Select defaultValue="holiland" style={{ width: 140 }} size="middle">
              <Option value="">全部品牌</Option>
              <Option value="holiland">好利来</Option>
              <Option value="boshifu">鲍师傅</Option>
              <Option value="qianji">仟吉</Option>
              <Option value="naixue">奈雪的茶</Option>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)', whiteSpace: 'nowrap' }}>时间范围</span>
            <Select defaultValue="7" style={{ width: 140 }} size="middle">
              <Option value="7">近7天</Option>
              <Option value="30">近30天</Option>
              <Option value="custom">自定义</Option>
            </Select>
          </div>
          <div className="flex-1" />
          <Button type="primary" icon={<ReloadOutlined />}>刷新监控</Button>
        </div>
      </Card>

      {/* 监控卡片网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* 1. 竞品动态追踪 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--yp-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yp-primary-600)' }}>
                <RadarChartOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--yp-neutral-900)' }}>竞品动态追踪</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>近7天竞品发布动态</div>
              </div>
            </div>
            <Tag className="yp-tag-primary">+24 条</Tag>
          </div>
          <div className="space-y-3">
            {competitorActivities.map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--yp-neutral-50)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${a.color}20`, color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                  {a.brand[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{a.brand}</span>
                    <Tag className="yp-tag-neutral">{a.platform}</Tag>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--yp-neutral-700)' }}>{a.content}</div>
                  <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)', marginTop: 4 }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 2. 热销产品分析 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--yp-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yp-primary-600)' }}>
                <FireOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--yp-neutral-900)' }}>热销产品分析</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>竞品平台热销烘焙单品</div>
              </div>
            </div>
            <Tag className="yp-tag-warning">TOP 5</Tag>
          </div>
          <div className="space-y-4">
            {hotProducts.map((p) => (
              <div key={p.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{p.name}</span>
                    <Tag className={p.tagClass}>{p.tag}</Tag>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-primary-600)' }}>{p.heat} 热度</span>
                </div>
                <div className="yp-heat-bar" style={{ height: 8, background: 'var(--yp-neutral-200)', borderRadius: 4, overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${p.heat}%`, background: 'var(--yp-primary-500)', borderRadius: 4 }}></span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)', marginTop: 4 }}>{p.source}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 3. 成功原因拆解 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--yp-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yp-primary-600)' }}>
                <BulbOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--yp-neutral-900)' }}>成功原因拆解</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>爆款内容/产品关键因素</div>
              </div>
            </div>
            <Tag className="yp-tag-success">AI 提炼</Tag>
          </div>
          <div className="space-y-3">
            {successFactors.map((f, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ border: '1px solid var(--yp-border)' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--yp-primary-100)', color: 'var(--yp-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)', marginTop: 2 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 4. 市场机会点 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--yp-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yp-primary-600)' }}>
                <RiseOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--yp-neutral-900)' }}>市场机会点</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>可切入的空白需求</div>
              </div>
            </div>
            <Tag className="yp-tag-info">4 个方向</Tag>
          </div>
          <div className="space-y-3">
            {opportunities.map((o) => (
              <div key={o.title} className="p-3 rounded-lg" style={{ background: 'var(--yp-primary-50)', border: '1px solid var(--yp-primary-100)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-primary-700)' }}>{o.title}</span>
                  <Tag className={o.priorityClass}>{o.priority}</Tag>
                </div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-700)' }}>{o.desc}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* 5. 平台动态监控 */}
        <Card variant="borderless" styles={{ body: { padding: 20 } }} className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--yp-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yp-primary-600)' }}>
                <FundOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--yp-neutral-900)' }}>平台动态监控</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>各平台实时趋势话题</div>
              </div>
            </div>
            <Tag className="yp-tag-primary">实时</Tag>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {platformTrends.map((t) => (
              <div key={t.platform} className="p-3 rounded-lg" style={{ border: '1px solid var(--yp-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span style={{ width: 20, height: 20, borderRadius: 4, background: t.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>
                      <FundOutlined style={{ fontSize: 12 }} />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{t.platform}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>热度 {t.heat}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--yp-neutral-800)' }}>{t.topic}</div>
                <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)', marginTop: 4 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 底部说明 */}
      <div className="flex items-center justify-between">
        <div style={{ fontSize: 13, color: 'var(--yp-neutral-500)' }}>数据更新时间：2026-09-22 09:30:00 · 下次自动刷新 10:30</div>
        <div className="flex items-center gap-2">
          <span className="yp-status-dot yp-status-dot-success"></span>
          <span style={{ fontSize: 13, color: 'var(--yp-neutral-500)' }}>监控正常运行中</span>
        </div>
      </div>
    </div>
  );
}
