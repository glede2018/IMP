/**
 * 全局类型定义
 * 后续后端接口字段变更时，统一在此维护
 */

/** 账号平台类型 */
export type Platform = 'douyin' | 'xiaohongshu' | 'kuaishou' | 'shipinhao';

/** 账号状态 */
export type AccountStatus = 'active' | 'inactive' | 'warning';

/** 账号归属阶梯 */
export type AccountTier = 'brand' | 'personal_ip' | 'store_ip';

/** 账号 TOP 作品 */
export interface AccountTopWork {
  title: string;
  views: string;
}

/** 矩阵账号 */
export interface Account {
  id: string;
  platform: Platform;
  nickname: string;
  avatar?: string;
  /** 账号 ID（平台内标识） */
  accountId: string;
  /** 归属阶梯 */
  tier: AccountTier;
  fans: number;
  /** 月增粉丝数（万） */
  monthlyGrowth: number;
  status: AccountStatus;
  bindTime: string;
  lastSyncTime?: string;
  /** TOP3 作品 */
  topWorks?: AccountTopWork[];
}

/** 模板分类 */
export type TemplateCategory = 'new_product' | 'festival' | 'ingredient' | 'store';

/** 内容模板 */
export interface Template {
  id: string;
  title: string;
  cover?: string;
  description: string;
  tags: string[];
  /** 分类 */
  category: TemplateCategory;
  usageCount: number;
  createdAt: string;
}

/** 素材类型 */
export type AssetType = 'product' | 'copy' | 'image' | 'portrait' | 'voice';

/** 素材库条目 */
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  preview?: string;
  size?: number;
  tags: string[];
  createdAt: string;
}

/** 作品内容 */
export interface Work {
  id: string;
  title: string;
  cover?: string;
  status: WorkStatus;
  platform?: Platform;
  createdAt: string;
  publishedAt?: string;
  views?: number;
  likes?: number;
  /** 文件格式 */
  format?: string;
  /** 分辨率 */
  resolution?: string;
  /** 文件大小（MB） */
  size?: number;
  /** 生成耗时（秒） */
  duration?: number;
  /** 分发状态 */
  distributeStatus?: 'pending' | 'distributed' | 'distributing';
}

/** 作品状态 */
export type WorkStatus = 'draft' | 'generating' | 'review' | 'published' | 'failed';

/** 可分发账号（用于分发弹窗） */
export interface DistributableAccount {
  id: string;
  platform: Platform;
  nickname: string;
  accountId: string;
  /** 账号类型标签：旗舰/认证/普通 */
  tagType: 'flagship' | 'verified' | 'normal';
}

/** 分发任务 */
export interface DistributeTask {
  id: string;
  workId: string;
  platforms: Platform[];
  status: 'pending' | 'processing' | 'success' | 'partial' | 'failed';
  progress: number;
  createdAt: string;
}

/** AI 生成任务 */
export interface GenerationTask {
  id: string;
  type: 'video' | 'copy' | 'image';
  status: 'pending' | 'running' | 'success' | 'failed';
  progress: number;
  result?: string;
  createdAt: string;
}

/** 数据大盘指标 */
export interface DashboardMetrics {
  totalWorks: number;
  totalViews: number;
  totalLikes: number;
  activeAccounts: number;
  trend: {
    date: string;
    views: number;
    likes: number;
    works: number;
  }[];
  regionData: {
    name: string;
    value: number;
  }[];
  audienceData: {
    name: string;
    value: number;
  }[];
}

/** 帮助中心文档/课程 */
export interface HelpResource {
  id: string;
  title: string;
  type: 'course' | 'doc' | 'contact';
  description?: string;
  url?: string;
  createdAt: string;
}
