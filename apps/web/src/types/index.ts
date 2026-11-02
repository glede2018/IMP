export type Platform = "douyin" | "xiaohongshu" | "kuaishou" | "shipinhao";
export type AccountTier = "brand" | "personal_ip" | "store_ip";
export type AccountStatus = "warning" | "active" | "inactive";
export type AssetType = "product" | "copy" | "image" | "portrait" | "voice";
export type TemplateCategory =
  "new_product" | "festival" | "ingredient" | "store";
export type WorkStatus = "draft" | "review" | "approved" | "rejected";
export type Role = "admin" | "operator" | "reviewer" | "viewer";
export interface UserInfo {
  id: string;
  name: string;
  phone: string;
  role: Role;
  active: boolean;
  organizationId: string;
  company: string;
  username: string;
  roles: { id: string; name: string; active: boolean }[];
  permissions: string[];
  createdAt: string;
  lastLoginAt?: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Store {
  id: string;
  name: string;
}
export interface Account {
  id: string;
  nickname: string;
  accountId: string;
  platform: Platform;
  tier: AccountTier;
  status: AccountStatus;
  storeId?: string;
  store?: Store;
  bindTime: string;
  avatar?: string;
  authorization?: {
    mode: "live" | "demo";
    scopes: string[];
    expiresAt: string;
    refreshExpiresAt: string;
    lastVerifiedAt: string;
  } | null;
}
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  tags: string[];
  mimeType: string;
  size: number;
  preview: string;
  downloadUrl: string;
  createdAt: string;
}
export interface Template {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  config: Record<string, unknown>;
  coverAssetId?: string;
  createdAt: string;
}
export interface Work {
  id: string;
  title: string;
  status: WorkStatus;
  assetId: string;
  asset: Asset;
  templateId?: string;
  template?: { id: string; title: string };
  fileUrl: string;
  downloadUrl: string;
  createdAt: string;
}
export interface HelpResource {
  id: string;
  title: string;
  type: "course" | "doc" | "contact";
  description?: string;
  url?: string;
  createdAt: string;
}
export interface DashboardMetrics {
  activeAccounts: number;
  totalWorks: number;
  totalAccounts: number;
  totalAssets: number;
  totalTemplates: number;
  reviewWorks: number;
  todayWorks: number;
  storageBytes: number;
  trend: { date: string; works: number }[];
  accountDistribution: { platform: Platform; count: number }[];
}
export interface Audit {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  createdAt: string;
}
