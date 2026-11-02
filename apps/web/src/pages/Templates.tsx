import { useEffect, useState } from 'react';
import { Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { fetchTemplates, templateCategoryMap } from '@/services/ui-api';
import { reportError } from '@/services/ui-api';
import type { Template, TemplateCategory } from '@/types/ui';

/**
 * 模板市场页
 * 分类标签筛选 + 模板卡片网格 + "使用模板"跳转 AI 视频生成编辑页
 */
export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>('all');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    fetchTemplates().then((data) => {
      setTemplates(data);
    }).catch(reportError).finally(() => setLoading(false));
  }, []);

  const filtered = activeCategory === 'all' ? templates : templates.filter((t) => t.category === activeCategory);

  const categoryFilters: { key: TemplateCategory | 'all'; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'new_product', label: '新品宣传' },
    { key: 'festival', label: '节日蛋糕' },
    { key: 'ingredient', label: '原料科普' },
    { key: 'store', label: '门店探店' },
  ];

  // 分类对应的渐变封面色
  const categoryGradients: Record<TemplateCategory, string> = {
    new_product: 'linear-gradient(135deg, #FED7AA, #FDBA74)',
    festival: 'linear-gradient(135deg, #FFEDD5, #FED7AA)',
    ingredient: 'linear-gradient(135deg, #FFF7ED, #FED7AA)',
    store: 'linear-gradient(135deg, #FFEDD5, #FDBA74)',
  };

  return (
    <div className="space-y-6">
      <div className="yp-page-header">
        <h1>模板市场</h1>
        <p>浏览并选用适合烘焙门店场景的内容模板，一键生成矩阵文案与配图</p>
      </div>

      {/* 分类标签 */}
      <div className="flex flex-wrap items-center gap-2">
        {categoryFilters.map((f) => (
          <button
            key={f.key}
            className={`yp-tag ${activeCategory === f.key ? 'yp-tag-primary' : 'yp-tag-neutral'}`}
            onClick={() => setActiveCategory(f.key)}
            style={{ cursor: 'pointer', fontSize: 14, padding: '6px 14px' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 模板网格 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="yp-card animate-pulse">
              <div className="h-40" style={{ background: 'var(--yp-neutral-100)' }} />
              <div className="p-5 space-y-3">
                <div className="h-4 rounded" style={{ background: 'var(--yp-neutral-100)' }} />
                <div className="h-3 rounded w-3/4" style={{ background: 'var(--yp-neutral-100)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((item) => {
            const cat = templateCategoryMap[item.category];
            return (
              <div key={item.id} className="yp-card overflow-hidden hover:shadow-md transition-shadow">
                {/* 封面 */}
                <div
                  className="h-40 w-full flex items-center justify-center"
                  style={{ background: categoryGradients[item.category] }}
                >
                  <span style={{ fontSize: 48, color: 'var(--yp-primary-600)' }}>🍰</span>
                </div>
                {/* 内容 */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--yp-neutral-900)', margin: 0 }}>{item.title}</h3>
                    <Tag className={cat.tagClass}>{cat.label}</Tag>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--yp-neutral-500)', margin: '0 0 16px 0', lineHeight: 1.6 }}>
                    {item.description}
                  </p>
                  <button
                    className="yp-btn yp-btn-primary yp-btn-sm w-full"
                    onClick={() => navigate(`/video-editor?templateId=${item.id}`)}
                  >
                    使用模板
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="yp-card p-12 text-center">
          <p style={{ fontSize: 14, color: 'var(--yp-neutral-500)' }}>暂无匹配的模板</p>
        </div>
      )}
    </div>
  );
}
