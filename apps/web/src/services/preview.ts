/**
 * Mock API 服务层
 * 所有接口均为前端模拟，后续后端对接时：
 * 1. 将 axios 的 baseURL 替换为真实后端地址
 * 2. 移除 mock 数据生成逻辑
 * 3. 保持返回类型与前端一致即可
 */
import type {
  Account,
  AccountStatus,
  AccountTier,
  Asset,
  AssetType,
  DashboardMetrics,
  DistributableAccount,
  DistributeTask,
  GenerationTask,
  HelpResource,
  Platform,
  Template,
  TemplateCategory,
  Work,
  WorkStatus,
} from '@/types/preview';

// 模拟网络延迟，让交互更真实
const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

/** 账号管理 - 获取矩阵账号列表 */
export async function fetchAccounts(): Promise<Account[]> {
  await delay();
  // TODO: 后续对接后端 GET /api/accounts
  return [
    {
      id: '1', platform: 'douyin', nickname: '御品轩官方旗舰店', accountId: 'ypx_official',
      tier: 'brand', fans: 1285000, monthlyGrowth: 2.3, status: 'active', bindTime: '2024-01-15',
      topWorks: [
        { title: '教你做出拉丝牛角包', views: '245.8w 播放' },
        { title: '门店现烤全流程揭秘', views: '189.2w 播放' },
        { title: '中秋限定礼盒开箱', views: '156.7w 播放' },
      ],
    },
    {
      id: '2', platform: 'douyin', nickname: '李师傅烘焙日记', accountId: 'master_li_bake',
      tier: 'personal_ip', fans: 862000, monthlyGrowth: 5.1, status: 'active', bindTime: '2024-02-20',
      topWorks: [
        { title: '法式可颂开酥全过程', views: '312.5w 播放' },
        { title: '在家也能做的欧包', views: '198.3w 播放' },
        { title: '厨师机选购避坑指南', views: '145.6w 播放' },
      ],
    },
    {
      id: '3', platform: 'kuaishou', nickname: '朝阳门店美食探店', accountId: 'ypx_chaoyang',
      tier: 'store_ip', fans: 321000, monthlyGrowth: 0.8, status: 'active', bindTime: '2024-03-10',
    },
    {
      id: '4', platform: 'xiaohongshu', nickname: '西稍门店烘焙日常', accountId: 'ypx_xishao',
      tier: 'store_ip', fans: 156000, monthlyGrowth: -0.2, status: 'inactive', bindTime: '2024-04-05',
    },
    {
      id: '5', platform: 'kuaishou', nickname: '御品轩快手旗舰店', accountId: 'ypx_kuaishou',
      tier: 'brand', fans: 674000, monthlyGrowth: 1.5, status: 'active', bindTime: '2024-01-20',
    },
    {
      id: '6', platform: 'xiaohongshu', nickname: '王姐教你做甜品', accountId: 'wangjie_bake',
      tier: 'personal_ip', fans: 438000, monthlyGrowth: 3.2, status: 'warning', bindTime: '2024-02-15',
    },
    {
      id: '7', platform: 'douyin', nickname: '高新门店每日鲜烤', accountId: 'ypx_gaoxin',
      tier: 'store_ip', fans: 289000, monthlyGrowth: 0.5, status: 'active', bindTime: '2024-03-25',
    },
    {
      id: '8', platform: 'xiaohongshu', nickname: '御品轩小红书官方', accountId: 'ypx_xiaohongshu',
      tier: 'brand', fans: 513000, monthlyGrowth: 2.1, status: 'active', bindTime: '2024-01-18',
    },
    {
      id: '9', platform: 'shipinhao', nickname: '御品轩视频号', accountId: 'ypx_shipinhao',
      tier: 'brand', fans: 45000, monthlyGrowth: 0.3, status: 'active', bindTime: '2024-04-05',
    },
    {
      id: '10', platform: 'douyin', nickname: '小南门店下午茶', accountId: 'ypx_xiaonan',
      tier: 'store_ip', fans: 198000, monthlyGrowth: 1.1, status: 'active', bindTime: '2024-05-12',
    },
  ];
}

/** 账号管理 - 更新账号状态 */
export async function updateAccountStatus(id: string, status: AccountStatus): Promise<void> {
  await delay(300);
  // TODO: 后续对接后端 PUT /api/accounts/{id}/status
  console.log('[mock] update account', id, status);
}

/** 账号管理 - 解绑账号 */
export async function unbindAccount(id: string): Promise<void> {
  await delay(300);
  // TODO: 后续对接后端 DELETE /api/accounts/{id}
  console.log('[mock] unbind account', id);
}

/** 内容创作 - 获取模板市场列表 */
export async function fetchTemplates(): Promise<Template[]> {
  await delay();
  // TODO: 后续对接后端 GET /api/templates
  return [
    { id: 't-1', title: '新品草莓蛋糕宣传', description: '突出草莓新鲜度与奶油轻盈感，适合春季新品上市全渠道推广。', tags: ['新品宣传'], category: 'new_product', usageCount: 326, createdAt: '2024-08-01' },
    { id: 't-2', title: '中秋团圆月饼', description: '中秋礼盒预热与团圆场景种草，适配门店引流与私域转化。', tags: ['节日蛋糕'], category: 'festival', usageCount: 289, createdAt: '2024-08-03' },
    { id: 't-3', title: '法国黄油原料科普', description: '以专业角度解读原料来源与工艺，提升品牌信任感与产品溢价。', tags: ['原料科普'], category: 'ingredient', usageCount: 156, createdAt: '2024-08-05' },
    { id: 't-4', title: '钟楼旗舰店探店', description: '门店环境、产品陈列与体验流程展示，吸引本地流量到店打卡。', tags: ['门店探店'], category: 'store', usageCount: 198, createdAt: '2024-08-07' },
    { id: 't-5', title: '樱桃芝士挞上新', description: '酸甜樱桃与浓郁芝士的口感碰撞，打造夏日限定爆款话题。', tags: ['新品宣传'], category: 'new_product', usageCount: 212, createdAt: '2024-08-10' },
    { id: 't-6', title: '圣诞限定礼盒', description: '节日氛围包装与场景化送礼文案，推动年末团购与礼盒销售。', tags: ['节日蛋糕'], category: 'festival', usageCount: 178, createdAt: '2024-08-12' },
    { id: 't-7', title: '天然酵母面包科普', description: '讲述天然酵母发酵故事，强化健康、低负担的产品心智。', tags: ['原料科普'], category: 'ingredient', usageCount: 134, createdAt: '2024-08-15' },
    { id: 't-8', title: '社区店开业探店', description: '新店开业福利与周边社区场景结合，快速建立本地认知。', tags: ['门店探店'], category: 'store', usageCount: 167, createdAt: '2024-08-18' },
  ];
}

/** 素材库 - 获取素材列表 */
export async function fetchAssets(type?: AssetType): Promise<Asset[]> {
  await delay();
  // TODO: 后续对接后端 GET /api/assets?type=xxx
  const typeLabels: Record<AssetType, string> = {
    product: '产品素材',
    copy: '文案素材',
    image: '图片素材',
    portrait: '数字肖像',
    voice: '语音素材',
  };
  return Array.from({ length: 6 }).map((_, i) => ({
    id: `a-${type || 'all'}-${i}`,
    type: type || 'product',
    name: `${typeLabels[type || 'product']}-${i + 1}`,
    tags: ['门店', '新品'],
    createdAt: '2024-08-10',
  }));
}

/** 作品中心 - 获取作品列表 */
export async function fetchWorks(): Promise<Work[]> {
  await delay();
  // TODO: 后续对接后端 GET /api/works
  return [
    { id: 'w-1', title: '中秋月饼礼盒推广视频_01', status: 'published', platform: 'douyin', createdAt: '2025-09-18 14:32', views: 128500, likes: 8920, format: 'MP4', resolution: '1920×1080', size: 15.2, duration: 204, distributeStatus: 'pending' },
    { id: 'w-2', title: '经典蛋黄酥新品上市_横版', status: 'published', createdAt: '2025-09-18 11:15', views: 86200, likes: 5340, format: 'MP4', resolution: '1080×1920', size: 8.6, duration: 168, distributeStatus: 'distributed' },
    { id: 'w-3', title: '草莓蛋糕春日种草视频', status: 'published', platform: 'xiaohongshu', createdAt: '2025-09-17 16:48', views: 56300, likes: 4120, format: 'MP4', resolution: '1080×1920', size: 12.4, duration: 156, distributeStatus: 'pending' },
    { id: 'w-4', title: '门店现烤面包沉浸式记录', status: 'generating', createdAt: '2025-09-22 09:15', format: 'MP4', resolution: '1920×1080', size: 0, duration: 0, distributeStatus: 'pending' },
    { id: 'w-5', title: '中秋礼盒开箱测评_小红书', status: 'published', platform: 'xiaohongshu', createdAt: '2025-09-16 10:22', views: 34500, likes: 2890, format: 'MP4', resolution: '1080×1920', size: 9.8, duration: 142, distributeStatus: 'distributed' },
  ];
}

/** 作品中心 - 创建 AI 生成任务（模拟轮询） */
export async function createGenerationTask(type: GenerationTask['type']): Promise<GenerationTask> {
  await delay(300);
  // TODO: 后续对接后端 POST /api/generation-tasks
  return {
    id: `gen-${Date.now()}`,
    type,
    status: 'running',
    progress: 0,
    createdAt: new Date().toISOString(),
  };
}

/** 作品中心 - 轮询生成任务状态 */
export async function pollGenerationTask(taskId: string): Promise<GenerationTask> {
  await delay(600);
  // TODO: 后续对接后端 GET /api/generation-tasks/{id}
  const progress = Math.min(100, Math.floor(Math.random() * 80) + 20);
  return {
    id: taskId,
    type: 'video',
    status: progress >= 100 ? 'success' : 'running',
    progress,
    result: progress >= 100 ? 'https://example.com/output.mp4' : undefined,
    createdAt: new Date().toISOString(),
  };
}

/** 作品中心 - 创建分发任务（模拟轮询） */
export async function createDistributeTask(workId: string, platforms: Platform[]): Promise<DistributeTask> {
  await delay(300);
  // TODO: 后续对接后端 POST /api/distribute-tasks
  return {
    id: `dist-${Date.now()}`,
    workId,
    platforms,
    status: 'processing',
    progress: 0,
    createdAt: new Date().toISOString(),
  };
}

/** 作品中心 - 轮询分发任务状态 */
export async function pollDistributeTask(taskId: string): Promise<DistributeTask> {
  await delay(600);
  // TODO: 后续对接后端 GET /api/distribute-tasks/{id}
  const progress = Math.min(100, Math.floor(Math.random() * 80) + 20);
  return {
    id: taskId,
    workId: 'w-1',
    platforms: ['douyin'],
    status: progress >= 100 ? 'success' : 'processing',
    progress,
    createdAt: new Date().toISOString(),
  };
}

/** 数据中心 - 获取大盘指标 */
export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  await delay();
  // TODO: 后续对接后端 GET /api/analytics/dashboard
  const trend = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      date: date.toISOString().slice(5, 10),
      views: 8000 + i * 1200 + Math.floor(Math.random() * 1000),
      likes: 400 + i * 80 + Math.floor(Math.random() * 100),
      works: 2 + Math.floor(Math.random() * 3),
    };
  });
  return {
    totalWorks: 128,
    totalViews: 892000,
    totalLikes: 45600,
    activeAccounts: 12,
    trend,
    regionData: [
      { name: '陕西', value: 32000 },
      { name: '北京', value: 21000 },
      { name: '上海', value: 18500 },
      { name: '广东', value: 15000 },
      { name: '四川', value: 12000 },
    ],
    audienceData: [
      { name: '18-24岁', value: 25 },
      { name: '25-34岁', value: 40 },
      { name: '35-44岁', value: 22 },
      { name: '45岁以上', value: 13 },
    ],
  };
}

/** 帮助中心 - 获取资源列表 */
export async function fetchHelpResources(): Promise<HelpResource[]> {
  await delay();
  // TODO: 后续对接后端 GET /api/help/resources
  return [
    { id: 'h-1', type: 'course', title: '系统快速上手', description: '5 分钟了解御品轩智能营销系统后台', createdAt: '2024-09-01' },
    { id: 'h-2', type: 'course', title: 'AI 视频生成教程', description: '从模板到成片的全流程', createdAt: '2024-09-02' },
    { id: 'h-3', type: 'doc', title: '产品功能白皮书', description: '核心功能与最佳实践', createdAt: '2024-09-03' },
    { id: 'h-4', type: 'contact', title: '客户成功经理', description: '企业微信：yupinxuan-csm', createdAt: '2024-09-04' },
  ];
}

/** 通用状态映射：用于 UI 标签展示 */
export const statusMap: Record<WorkStatus, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'default' },
  generating: { label: '生成中', color: 'processing' },
  review: { label: '审核中', color: 'warning' },
  published: { label: '已发布', color: 'success' },
  failed: { label: '失败', color: 'error' },
} as const;

export const platformMap: Record<Platform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  kuaishou: '快手',
  shipinhao: '视频号',
};

/** 平台品牌色 */
export const platformColorMap: Record<Platform, string> = {
  douyin: '#1C1C1C',
  xiaohongshu: '#FF2442',
  kuaishou: '#FF6600',
  shipinhao: '#07C160',
};

/** 平台图标名（ant-design icon 名称对应） */
export const platformIconMap: Record<Platform, string> = {
  douyin: 'MusicOutlined',
  xiaohongshu: 'BookOutlined',
  kuaishou: 'VideoCameraOutlined',
  shipinhao: 'PlayCircleOutlined',
};

/** 账号阶梯映射 */
export const tierMap: Record<AccountTier, { label: string; tagClass: string }> = {
  brand: { label: '品牌号', tagClass: 'yp-tag-primary' },
  personal_ip: { label: '个人 IP', tagClass: 'yp-tag-warning' },
  store_ip: { label: '门店 IP', tagClass: 'yp-tag-info' },
};

/** 账号状态映射 */
export const accountStatusMap: Record<AccountStatus, { label: string; dotClass: string; tagClass: string }> = {
  active: { label: '已绑定', dotClass: 'yp-status-dot-success', tagClass: 'yp-tag-success' },
  warning: { label: '待授权', dotClass: 'yp-status-dot-warning', tagClass: 'yp-tag-warning' },
  inactive: { label: '失效', dotClass: 'yp-status-dot-error', tagClass: 'yp-tag-error' },
};

/** 模板分类映射 */
export const templateCategoryMap: Record<TemplateCategory, { label: string; tagClass: string }> = {
  new_product: { label: '新品宣传', tagClass: 'yp-tag-primary' },
  festival: { label: '节日蛋糕', tagClass: 'yp-tag-warning' },
  ingredient: { label: '原料科普', tagClass: 'yp-tag-info' },
  store: { label: '门店探店', tagClass: 'yp-tag-success' },
};

/** 作品分发状态映射 */
export const distributeStatusMap: Record<NonNullable<Work['distributeStatus']>, { label: string; tagClass: string }> = {
  pending: { label: '待发布', tagClass: 'yp-tag-primary' },
  distributed: { label: '已发布', tagClass: 'yp-tag-success' },
  distributing: { label: '分发中', tagClass: 'yp-tag-warning' },
};

/** 获取可分发的矩阵账号列表 */
export async function fetchDistributableAccounts(): Promise<DistributableAccount[]> {
  await delay();
  return [
    { id: 'a-1', platform: 'douyin', nickname: '御品轩官方号', accountId: 'ypx_official', tagType: 'flagship' },
    { id: 'a-2', platform: 'douyin', nickname: '御品轩烘焙日记', accountId: 'ypx_bake', tagType: 'verified' },
    { id: 'a-3', platform: 'douyin', nickname: '御品轩·探店达人', accountId: 'ypx_tandian', tagType: 'normal' },
    { id: 'a-4', platform: 'douyin', nickname: '御品轩甜品站', accountId: 'ypx_sweet', tagType: 'normal' },
    { id: 'a-5', platform: 'kuaishou', nickname: '御品轩快官方', accountId: 'ypx_kuaishou', tagType: 'flagship' },
    { id: 'a-6', platform: 'kuaishou', nickname: '御品轩吃播', accountId: 'ypx_chibo', tagType: 'verified' },
    { id: 'a-7', platform: 'kuaishou', nickname: '御品轩门店直播', accountId: 'ypx_live', tagType: 'normal' },
    { id: 'a-8', platform: 'xiaohongshu', nickname: '御品轩生活家', accountId: 'ypx_life', tagType: 'flagship' },
    { id: 'a-9', platform: 'xiaohongshu', nickname: '御品轩探店笔记', accountId: 'ypx_note', tagType: 'verified' },
    { id: 'a-10', platform: 'xiaohongshu', nickname: '御品轩好物分享', accountId: 'ypx_share', tagType: 'normal' },
  ];
}

/** 账号类型标签映射 */
export const accountTagTypeMap: Record<DistributableAccount['tagType'], { label: string; tagClass: string }> = {
  flagship: { label: '旗舰', tagClass: 'yp-tag-primary' },
  verified: { label: '认证', tagClass: 'yp-tag-success' },
  normal: { label: '普通', tagClass: 'yp-tag-neutral' },
};
