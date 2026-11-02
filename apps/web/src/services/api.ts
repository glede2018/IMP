import type { Page, DashboardMetrics, UserInfo, Store } from "@/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "X-IMP-Request": "1",
      ...(!isForm && options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "请求失败" }));
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.dispatchEvent(new Event("imp-session-expired"));
    throw new ApiError(
      response.status,
      Array.isArray(data.message)
        ? data.message.join("；")
        : data.message || "请求失败",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const getPage = <T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return request<Page<T>>(`${path}?${query}`);
};
export const save = <T>(path: string, data: unknown, method = "POST") =>
  request<T>(path, { method, body: JSON.stringify(data) });
export const remove = (path: string) => request(path, { method: "DELETE" });
export const fetchMetrics = () =>
  request<DashboardMetrics>("/analytics/overview");
export const fetchMe = () => request<UserInfo>("/auth/me");
export const fetchStores = () => request<Store[]>("/organization/stores");
export const platformMap = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  kuaishou: "快手",
  shipinhao: "视频号",
};
export const tierMap = {
  brand: "品牌号",
  personal_ip: "个人 IP",
  store_ip: "门店 IP",
};
export const categoryMap = {
  new_product: "新品宣传",
  festival: "节日内容",
  ingredient: "原料科普",
  store: "门店探店",
};
export const assetTypeMap = {
  product: "产品素材",
  copy: "文案素材",
  image: "图片素材",
  portrait: "数字肖像",
  voice: "语音素材",
};
export const roleMap = {
  admin: "管理员",
  operator: "运营",
  reviewer: "审核员",
  viewer: "只读成员",
};
export const workStatusMap = {
  draft: "草稿",
  review: "待审核",
  approved: "通过",
  rejected: "驳回",
};
export const formatDate = (date: string) =>
  new Date(date).toLocaleString("zh-CN", { hour12: false });
export const formatSize = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(2)} MB`;
