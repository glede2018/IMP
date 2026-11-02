import { useEffect, useState } from 'react';
import { Card, Tag, Input, Button, Progress, message, Modal } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleFilled,
  SmileOutlined,
  UserOutlined,
  HeartOutlined,
  StarOutlined,
  CrownOutlined,
  CoffeeOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { fetchTemplates, templateCategoryMap } from '@/services/preview';
import type { Template } from '@/types/preview';

/**
 * AI 视频生成编辑页
 * 左侧模板预览 + 任务状态，右侧生成配置（人物元素、产品元素）
 */
export default function VideoEditor() {
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get('templateId');

  const [template, setTemplate] = useState<Template | null>(null);
  const [videoName, setVideoName] = useState('');
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(['char-1', 'char-4']);
  const [selectedProducts, setSelectedProducts] = useState<string[]>(['prod-1', 'prod-2']);
  const [generating] = useState(false);
  const [progress] = useState(0);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [assetModalType, setAssetModalType] = useState<'character' | 'product'>('character');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);

  useEffect(() => {
    fetchTemplates().then((data) => {
      setAllTemplates(data);
      const t = data.find((x) => x.id === templateId) || data[0];
      setTemplate(t);
      setVideoName(t.title + '宣传视频');
    });
  }, [templateId]);

  const characters = [
    { id: 'char-1', name: '微笑女主 A', icon: <SmileOutlined /> },
    { id: 'char-2', name: '年轻女主 B', icon: <UserOutlined /> },
    { id: 'char-3', name: '烘焙师 C', icon: <UserOutlined /> },
    { id: 'char-4', name: '端盘动作', icon: <HeartOutlined /> },
    { id: 'char-5', name: '品尝动作', icon: <StarOutlined /> },
    { id: 'char-6', name: '展示动作', icon: <StarOutlined /> },
  ];

  const products = [
    { id: 'prod-1', name: '草莓蛋糕', icon: <CrownOutlined /> },
    { id: 'prod-2', name: '草莓马卡龙', icon: <CoffeeOutlined /> },
    { id: 'prod-3', name: '草莓饮品', icon: <CoffeeOutlined /> },
    { id: 'prod-4', name: '切片蛋糕', icon: <CrownOutlined /> },
    { id: 'prod-5', name: '草莓冰淇淋', icon: <StarOutlined /> },
    { id: 'prod-6', name: '草莓可颂', icon: <CoffeeOutlined /> },
  ];

  const toggleCharacter = (id: string) => {
    setSelectedCharacters((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // 素材库数据
  const assetLibrary = {
    character: [
      { id: 'asset-char-1', name: '品牌代言人-A', type: '图片', icon: <SmileOutlined /> },
      { id: 'asset-char-2', name: '烘焙师形象-B', type: '图片', icon: <UserOutlined /> },
      { id: 'asset-char-3', name: '顾客形象-C', type: '图片', icon: <HeartOutlined /> },
      { id: 'asset-char-4', name: '店长形象-D', type: '图片', icon: <StarOutlined /> },
      { id: 'asset-char-5', name: '品鉴官-E', type: '图片', icon: <CrownOutlined /> },
      { id: 'asset-char-6', name: '服务生-F', type: '图片', icon: <CoffeeOutlined /> },
    ],
    product: [
      { id: 'asset-prod-1', name: '招牌草莓蛋糕', type: '图片', icon: <CrownOutlined /> },
      { id: 'asset-prod-2', name: '限定马卡龙礼盒', type: '图片', icon: <CoffeeOutlined /> },
      { id: 'asset-prod-3', name: '季节限定饮品', type: '图片', icon: <CoffeeOutlined /> },
      { id: 'asset-prod-4', name: '手工巧克力', type: '图片', icon: <StarOutlined /> },
      { id: 'asset-prod-5', name: '法式可颂', type: '图片', icon: <StarOutlined /> },
      { id: 'asset-prod-6', name: '冰淇淋套装', type: '图片', icon: <CrownOutlined /> },
    ],
  };

  const openAssetModal = (type: 'character' | 'product') => {
    setAssetModalType(type);
    setAssetModalOpen(true);
  };

  const handleAssetSelect = (id: string) => {
    if (assetModalType === 'character') {
      setSelectedCharacters((prev) => prev.includes(id) ? prev : [...prev, id]);
    } else {
      setSelectedProducts((prev) => prev.includes(id) ? prev : [...prev, id]);
    }
    message.success('素材已添加');
    setAssetModalOpen(false);
  };

  const handleTemplateSelect = (t: Template) => {
    setTemplate(t);
    setVideoName(t.title + '宣传视频');
    setTemplateModalOpen(false);
    message.success(`已切换到模板：${t.title}`);
  };

  const handleGenerate = () => {
    if (selectedCharacters.length === 0 || selectedProducts.length === 0) {
      message.warning('请至少选择一个人物元素和一个产品元素');
      return;
    }
    message.info('视频生成将在后续接入大模型服务。');
  };

  if (!template) return null;

  const cat = templateCategoryMap[template.category];

  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>AI 视频生成编辑</h1>
        <p>选择人物、产品素材与模板，一键生成品牌宣传视频</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 左侧：模板预览 */}
        <div className="flex-1 min-w-0" style={{ flexBasis: '55%' }}>
          <Card variant="borderless" styles={{ body: { padding: 24 } }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>模板预览</h2>
                <p style={{ fontSize: 14, color: 'var(--yp-neutral-500)', marginTop: 4, marginBottom: 0 }}>当前选用的视频模板效果</p>
              </div>
              <div className="flex items-center gap-3">
                <Tag className={cat.tagClass}>{cat.label}</Tag>
                <Button size="small" icon={<SwapOutlined />} onClick={() => setTemplateModalOpen(true)}>重新选择模板</Button>
              </div>
            </div>

            {/* 视频预览占位 */}
            <div
              className="relative w-full rounded-lg overflow-hidden flex items-center justify-center cursor-pointer group"
              style={{ aspectRatio: '16/9', background: 'linear-gradient(135deg, var(--yp-primary-200), var(--yp-primary-100), var(--yp-primary-300))' }}
            >
              <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 50%)' }} />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center text-[var(--yp-primary-600)] shadow-md group-hover:scale-105 transition-transform">
                  <PlayCircleOutlined style={{ fontSize: 32 }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-primary-700)' }}>点击预览模板视频</span>
              </div>
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <span style={{ fontSize: 12, color: 'var(--yp-primary-700)', fontWeight: 500 }}>00:15</span>
                <span style={{ fontSize: 12, color: 'var(--yp-primary-700)' }}>1080 × 1920</span>
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className="flex items-center gap-3 mb-2">
                <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>{template.title}</h3>
                <Tag className="yp-tag-neutral">竖版视频</Tag>
              </div>
              <p style={{ fontSize: 14, color: 'var(--yp-neutral-600)', lineHeight: 1.7, margin: 0 }}>
                {template.description}模板时长 15 秒，支持替换人物与产品素材。
              </p>
            </div>
          </Card>

          {/* 任务状态面板 */}
          {(generating || progress > 0) && (
            <Card variant="borderless" styles={{ body: { padding: 20 } }} style={{ marginTop: 24 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`yp-status-dot ${generating ? 'yp-status-dot-info animate-pulse' : 'yp-status-dot-success'}`}></span>
                  <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>
                    {generating ? '任务状态：AI 渲染生成中' : '任务状态：生成完成'}
                  </span>
                </div>
                <Tag className="yp-tag-info">预计 2 分钟</Tag>
              </div>
              <Progress percent={progress} showInfo={false} strokeColor="var(--yp-state-info)" />
              <div className="flex items-center justify-between mt-2" style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>
                <span>已完成：{progress >= 100 ? '渲染完成' : '素材合成'}</span>
                <span>{progress}%</span>
              </div>
            </Card>
          )}
        </div>

        {/* 右侧：配置面板 */}
        <div className="flex-1 min-w-0" style={{ flexBasis: '45%' }}>
          <Card variant="borderless" styles={{ body: { padding: 24 } }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: '0 0 20px 0' }}>生成配置</h2>

            {/* 选择人物元素 */}
            <div style={{ marginBottom: 24 }}>
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-800)', margin: 0 }}>选择人物元素</h3>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>已选 {selectedCharacters.length} 项</span>
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={() => openAssetModal('character')}>从素材库选择</Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {characters.map((c) => {
                  const selected = selectedCharacters.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className="yp-card cursor-pointer transition-colors"
                      onClick={() => toggleCharacter(c.id)}
                      style={{
                        padding: 12,
                        border: selected ? '2px solid var(--yp-primary-600)' : '2px solid transparent',
                        background: selected ? 'var(--yp-primary-50)' : 'var(--yp-card)',
                      }}
                    >
                      <div
                        className="aspect-square rounded-md flex items-center justify-center mb-2"
                        style={{ background: selected ? 'linear-gradient(135deg, var(--yp-primary-200), var(--yp-primary-100))' : 'linear-gradient(135deg, var(--yp-neutral-200), var(--yp-neutral-100))' }}
                      >
                        <span style={{ fontSize: 32, color: selected ? 'var(--yp-primary-600)' : 'var(--yp-neutral-500)' }}>{c.icon}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--yp-neutral-800)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      {selected && (
                        <div className="flex justify-center mt-1">
                          <CheckCircleFilled style={{ color: 'var(--yp-primary-600)' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 选择产品元素 */}
            <div style={{ marginBottom: 24 }}>
              <div className="flex items-center justify-between mb-3">
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-800)', margin: 0 }}>选择产品元素</h3>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>已选 {selectedProducts.length} 项</span>
                  <Button size="small" icon={<FolderOpenOutlined />} onClick={() => openAssetModal('product')}>从素材库选择</Button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {products.map((p) => {
                  const selected = selectedProducts.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className="yp-card cursor-pointer transition-colors"
                      onClick={() => toggleProduct(p.id)}
                      style={{
                        padding: 12,
                        border: selected ? '2px solid var(--yp-primary-600)' : '2px solid transparent',
                        background: selected ? 'var(--yp-primary-50)' : 'var(--yp-card)',
                      }}
                    >
                      <div
                        className="aspect-square rounded-md flex items-center justify-center mb-2"
                        style={{ background: selected ? 'linear-gradient(135deg, #FDE8D4, #FAD0A8)' : 'linear-gradient(135deg, var(--yp-neutral-200), var(--yp-neutral-100))' }}
                      >
                        <span style={{ fontSize: 32, color: selected ? 'var(--yp-primary-700)' : 'var(--yp-neutral-500)' }}>{p.icon}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--yp-neutral-800)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      {selected && (
                        <div className="flex justify-center mt-1">
                          <CheckCircleFilled style={{ color: 'var(--yp-primary-600)' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 视频名称 */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-800)', marginBottom: 8 }}>视频名称</label>
              <Input
                size="large"
                placeholder="请输入视频名称，如：新品草莓蛋糕宣传视频"
                value={videoName}
                onChange={(e) => setVideoName(e.target.value)}
              />
            </div>

            <Button
              type="primary"
              size="large"
              block
              onClick={handleGenerate}
              loading={generating}
              icon={<StarOutlined />}
            >
              {generating ? '生成中...' : '开始生成'}
            </Button>
          </Card>
        </div>
      </div>

      {/* 素材库选择弹窗 */}
      <Modal
        title={assetModalType === 'character' ? '素材库 - 人物素材' : '素材库 - 产品素材'}
        open={assetModalOpen}
        onCancel={() => setAssetModalOpen(false)}
        footer={null}
        width={640}
      >
        <div className="grid grid-cols-4 gap-3" style={{ padding: '8px 0' }}>
          {(assetModalType === 'character' ? assetLibrary.character : assetLibrary.product).map((asset) => {
            const selected = (assetModalType === 'character' ? selectedCharacters : selectedProducts).includes(asset.id);
            return (
              <div
                key={asset.id}
                className="yp-card cursor-pointer transition-all"
                onClick={() => handleAssetSelect(asset.id)}
                style={{
                  padding: 12,
                  border: selected ? '2px solid var(--yp-primary-600)' : '2px solid var(--yp-neutral-200)',
                  background: selected ? 'var(--yp-primary-50)' : 'var(--yp-card)',
                  opacity: selected ? 0.6 : 1,
                }}
              >
                <div
                  className="aspect-square rounded-md flex items-center justify-center mb-2"
                  style={{ background: 'linear-gradient(135deg, var(--yp-neutral-100), var(--yp-neutral-200))' }}
                >
                  <PictureOutlined style={{ fontSize: 28, color: 'var(--yp-neutral-500)' }} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--yp-neutral-800)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {asset.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--yp-neutral-400)', textAlign: 'center', marginTop: 2 }}>
                  {selected ? '已添加' : asset.type}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--yp-neutral-500)' }}>
          点击素材即可添加到已选列表，已添加的素材会标记为"已添加"
        </div>
      </Modal>

      {/* 重新选择模板弹窗 */}
      <Modal
        title="选择模板"
        open={templateModalOpen}
        onCancel={() => setTemplateModalOpen(false)}
        footer={null}
        width={800}
      >
        <div className="grid grid-cols-3 gap-4" style={{ padding: '8px 0', maxHeight: 480, overflowY: 'auto' }}>
          {allTemplates.map((t) => {
            const tc = templateCategoryMap[t.category];
            const isCurrent = template?.id === t.id;
            return (
              <div
                key={t.id}
                className="yp-card cursor-pointer transition-all"
                onClick={() => handleTemplateSelect(t)}
                style={{
                  padding: 12,
                  border: isCurrent ? '2px solid var(--yp-primary-600)' : '2px solid var(--yp-neutral-200)',
                  background: isCurrent ? 'var(--yp-primary-50)' : 'var(--yp-card)',
                }}
              >
                <div
                  className="aspect-video rounded-md flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, var(--yp-primary-200), var(--yp-primary-100))' }}
                >
                  <PlayCircleOutlined style={{ fontSize: 28, color: 'var(--yp-primary-600)' }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yp-neutral-900)', marginBottom: 4 }}>{t.title}</div>
                <div className="flex items-center justify-between">
                  <Tag className={tc.tagClass} style={{ fontSize: 11 }}>{tc.label}</Tag>
                  {isCurrent && <CheckCircleFilled style={{ color: 'var(--yp-primary-600)', fontSize: 14 }} />}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
