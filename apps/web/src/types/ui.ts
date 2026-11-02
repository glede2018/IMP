import type * as Api from './index';
import type * as Preview from './preview';
export type { Platform, AccountTier, AssetType, TemplateCategory, HelpResource, Asset } from './index';
export type Account = Api.Account & Partial<Pick<Preview.Account, 'avatar' | 'fans' | 'monthlyGrowth' | 'topWorks'>>;
export type Template = Api.Template & Partial<Pick<Preview.Template, 'cover' | 'usageCount'>>;
export type Work = Omit<Api.Work, 'status'> & Omit<Preview.Work, 'status'> & {status: Api.WorkStatus | Preview.WorkStatus};
export type DashboardMetrics = Api.DashboardMetrics & {
 activeAccounts: number;
 totalViews?: number;
 totalLikes?: number;
 regionData: {name:string;value:number}[];
 audienceData: {name:string;value:number}[];
};
