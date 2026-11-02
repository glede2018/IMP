import { fetchMetrics, getPage, remove } from "./api";
import type {
  Account,
  Asset,
  AssetType,
  DashboardMetrics,
  HelpResource,
  Template,
  Work,
} from "@/types/ui";
// Keep the original view model and presentation separate from API transport.
export {
  platformMap,
  platformColorMap,
  tierMap,
  accountStatusMap,
  templateCategoryMap,
  distributeStatusMap,
} from "./preview";
export const statusMap: Record<
  Work["status"],
  { label: string; color: string }
> = {
  draft: { label: "草稿", color: "default" },
  review: { label: "待审核", color: "warning" },
  approved: { label: "审核通过", color: "success" },
  rejected: { label: "已驳回", color: "error" },
  generating: { label: "生成中", color: "processing" },
  published: { label: "已完成", color: "success" },
  failed: { label: "失败", color: "error" },
};
async function all<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T[]> {
  const result = await getPage<T>(path, { ...params, page: 1, pageSize: 100 });
  const items = [...result.items];
  for (let page = 2; items.length < result.total; page++) {
    const next = await getPage<T>(path, { ...params, page, pageSize: 100 });
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return items;
}
export const fetchAccounts = () => all<Account>("/accounts");
export const unbindAccount = (id: string) => remove(`/accounts/${id}`);
export const fetchTemplates = () => all<Template>("/templates");
export const fetchAssets = (type?: AssetType) =>
  all<Asset>("/assets", { type });
export const fetchHelpResources = () => all<HelpResource>("/help/resources");
export async function fetchWorks(): Promise<Work[]> {
  return (await all<Work>("/works")).map((w) => ({
    ...w,
    format: w.asset.mimeType.split("/")[1]?.toUpperCase(),
    size: Number((w.asset.size / 1024 / 1024).toFixed(2)),
    resolution: "—",
    createdAt: new Date(w.createdAt).toLocaleString("zh-CN", { hour12: false }),
  }));
}
export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const metrics = await fetchMetrics();
  return {
    ...metrics,
    activeAccounts: metrics.activeAccounts,
    regionData: [],
    audienceData: [],
  };
}
export function reportError(error: unknown) {
  window.dispatchEvent(
    new CustomEvent("imp-ui-error", {
      detail: error instanceof Error ? error.message : "请求失败，请稍后重试",
    }),
  );
}
