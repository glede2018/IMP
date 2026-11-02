import { useState } from 'react';
import { Card, Input, InputNumber, DatePicker, Button, Tag, Empty } from 'antd';
import {
  StarFilled,
  InboxOutlined,
  TagOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  WarningOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;

/**
 * 产品选品策略页
 * 左侧参数配置 + 右侧 AI 选品方案结果
 */
export default function ProductSelection() {
  const [generated, setGenerated] = useState(true);

  const products = [
    { name: '六粒蛋黄酥礼盒', desc: '经典引流款，认知度高，适合首波曝光', tag: '引流款', tagClass: 'yp-tag-primary' },
    { name: '流心奶黄月饼礼盒', desc: '对标竞品升级，突出低糖与现烤工艺', tag: '利润款', tagClass: 'yp-tag-warning' },
    { name: '桂花乌龙茶歇礼盒', desc: '差异化组合，提升客单价与礼品属性', tag: '形象款', tagClass: 'yp-tag-info' },
    { name: '玉兔造型曲奇 + 限定礼袋', desc: '加购组合，强化节日氛围与送礼场景', tag: '组合款', tagClass: 'yp-tag-success' },
  ];

  const pricing = [
    { label: '主推礼盒定价', value: '168 元', sub: '锚定中高端礼赠心智', highlight: true },
    { label: '满减组合', value: '298 - 30', sub: '双盒满减提升连带率' },
    { label: '早鸟权益', value: '前 500 单', sub: '赠限定礼袋 + 优惠券' },
  ];

  const timeline = [
    { phase: '上市前预热期', date: '2026-09-01 至 2026-09-09', desc: '发布悬念海报、KOL 路透、礼盒剧透短视频，引导加购与预约。' },
    { phase: '上市期爆发', date: '2026-09-10 至 2026-09-17', desc: '中秋上市当日直播首发，搭配达人矩阵开箱与限时早鸟权益。' },
    { phase: '持续期收割', date: '2026-09-18 至 2026-10-10', desc: '长尾口碑内容沉淀，企业团购与送礼场景二次触达。' },
  ];

  const audience = ['25-35 岁女性', '礼品购买者', '节庆送礼场景', '西安本地用户', '注重颜值与仪式感', '偏好短视频种草'];

  const risks = [
    '竞品已在流心奶黄赛道建立低价认知，需通过"陕式酥皮+低糖"强化差异化。',
    '中秋节点集中度较高，礼盒库存建议按预售数据分三批备货，避免积压。',
    '物流时效敏感，预售截止需提前 5-7 天，确保节日履约体验。',
  ];

  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>选品策略</h1>
        <p>基于 AI Skill 自动生成新品推广选品方案</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-5">
        {/* 左侧表单 */}
        <div className="w-full xl:w-[380px] flex-shrink-0">
          <Card variant="borderless" styles={{ body: { padding: 20 } }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', marginBottom: 16 }}>参数配置</h2>
            <div className="space-y-4">
              <div>
                <label className="yp-form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-700)', marginBottom: 6 }}>推广新品/主题</label>
                <Input placeholder="中秋限定礼盒" defaultValue="中秋限定礼盒" size="large" />
              </div>
              <div>
                <label className="yp-form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-700)', marginBottom: 6 }}>竞品卖点参考</label>
                <TextArea
                  rows={3}
                  placeholder="请输入竞品卖点或差异化方向"
                  defaultValue="竞品主打流心奶黄+精美礼盒；可突出陕式酥皮、低糖配方与本地烘焙新鲜现烤优势。"
                />
              </div>
              <div>
                <label className="yp-form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-700)', marginBottom: 6 }}>客单价</label>
                <InputNumber
                  placeholder="168"
                  defaultValue={168}
                  size="large"
                  style={{ width: '100%' }}
                  addonAfter="元"
                />
              </div>
              <div>
                <label className="yp-form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-700)', marginBottom: 6 }}>推广时间</label>
                <div className="grid grid-cols-2 gap-3">
                  <DatePicker size="large" style={{ width: '100%' }} defaultValue={dayjs('2026-09-01')} placeholder="开始日期" />
                  <DatePicker size="large" style={{ width: '100%' }} defaultValue={dayjs('2026-10-10')} placeholder="结束日期" />
                </div>
              </div>
              <div>
                <label className="yp-form-label" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-700)', marginBottom: 6 }}>预期上市时间</label>
                <DatePicker size="large" style={{ width: '100%' }} defaultValue={dayjs('2026-09-10')} />
              </div>
              <div style={{ paddingTop: 8 }}>
                <Button type="primary" size="large" block icon={<StarFilled />} onClick={() => setGenerated(true)}>
                  生成选品方案
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* 右侧结果区 */}
        <div className="flex-1 min-w-0">
          <Card variant="borderless" styles={{ body: { padding: 20 } }}>
            {!generated ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--yp-neutral-800)' }}>输入参数后点击生成</div>
                    <div style={{ fontSize: 13, color: 'var(--yp-neutral-500)' }}>AI 将基于新品主题、竞品参考、价格与推广周期，输出选品建议、价格策略与推广节奏。</div>
                  </div>
                }
              />
            ) : (
              <div className="space-y-6">
                {/* 结果标题 */}
                <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--yp-border)' }}>
                  <div className="flex items-center gap-3">
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--yp-primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--yp-primary-600)' }}>
                      <StarFilled style={{ fontSize: 20 }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>AI 选品方案</h3>
                      <p style={{ fontSize: 12, color: 'var(--yp-neutral-500)', margin: 0 }}>生成时间：2026-09-22 10:32</p>
                    </div>
                  </div>
                  <Tag color="success"><span className="yp-status-dot yp-status-dot-success" style={{ marginRight: 4 }}></span>已完成</Tag>
                </div>

                {/* 推荐产品组合 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <InboxOutlined style={{ color: 'var(--yp-primary-600)' }} />
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>推荐产品组合</h4>
                  </div>
                  <div className="space-y-3">
                    {products.map((p) => (
                      <div key={p.name} className="flex items-start justify-between p-3 rounded-lg" style={{ background: 'var(--yp-neutral-50)', border: '1px solid var(--yp-border)' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{p.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)', marginTop: 2 }}>{p.desc}</div>
                        </div>
                        <Tag className={p.tagClass}>{p.tag}</Tag>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 价格策略建议 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <TagOutlined style={{ color: 'var(--yp-primary-600)' }} />
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>价格策略建议</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {pricing.map((p) => (
                      <div key={p.label} className="p-3 rounded-lg" style={{ background: p.highlight ? 'var(--yp-primary-50)' : 'var(--yp-neutral-50)', border: `1px solid ${p.highlight ? 'var(--yp-primary-100)' : 'var(--yp-border)'}` }}>
                        <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)', marginBottom: 4 }}>{p.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: p.highlight ? 'var(--yp-primary-600)' : 'var(--yp-neutral-900)' }}>{p.value}</div>
                        <div style={{ fontSize: 12, color: p.highlight ? 'var(--yp-primary-700)' : 'var(--yp-neutral-500)', marginTop: 4 }}>{p.sub}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 推广节奏规划 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <ClockCircleOutlined style={{ color: 'var(--yp-primary-600)' }} />
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>推广节奏规划</h4>
                  </div>
                  <div className="space-y-4">
                    {timeline.map((t, i) => (
                      <div key={i} className="yp-timeline-item" style={{ position: 'relative', paddingLeft: 20 }}>
                        <div className="yp-timeline-dot" style={{ position: 'absolute', left: 0, top: 5, width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--yp-primary-600)', background: 'var(--yp-card)' }}></div>
                        {i < timeline.length - 1 && <div style={{ position: 'absolute', left: 5, top: 17, bottom: -18, width: 2, background: 'var(--yp-border)' }}></div>}
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)' }}>{t.phase}</div>
                        <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>{t.date}</div>
                        <div style={{ fontSize: 13, color: 'var(--yp-neutral-700)', marginTop: 4 }}>{t.desc}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 目标人群画像 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <TeamOutlined style={{ color: 'var(--yp-primary-600)' }} />
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>目标人群画像</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {audience.map((a, i) => (
                      <Tag key={a} className={['yp-tag-primary', 'yp-tag-info', 'yp-tag-warning', 'yp-tag-success', 'yp-tag-neutral', 'yp-tag-primary'][i]}>{a}</Tag>
                    ))}
                  </div>
                </section>

                {/* 风险提示 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <WarningOutlined style={{ color: 'var(--yp-state-error)' }} />
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>风险提示</h4>
                  </div>
                  <div className="space-y-2">
                    {risks.map((r, i) => (
                      <div key={i} className="flex items-start gap-2" style={{ fontSize: 13, color: 'var(--yp-neutral-700)' }}>
                        <CloseCircleOutlined style={{ color: 'var(--yp-state-error)', flexShrink: 0, marginTop: 2 }} />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
