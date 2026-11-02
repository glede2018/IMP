import type { DashboardMetrics } from "@/types";
import { formatSize } from "@/services/api";
export default function MetricsCards({
  metrics,
}: {
  metrics: DashboardMetrics;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
      {[
        { label: "矩阵账号", value: metrics.totalAccounts },
        { label: "素材总数", value: metrics.totalAssets },
        { label: "模板总数", value: metrics.totalTemplates },
        { label: "作品总数", value: metrics.totalWorks },
        { label: "今日新增作品", value: metrics.todayWorks },
        { label: "待审核作品", value: metrics.reviewWorks },
        { label: "文件存储量", value: formatSize(metrics.storageBytes) },
      ].map((c) => (
        <div className="yp-card p-5" key={c.label}>
          <p className="text-sm text-gray-500 mb-2">{c.label}</p>
          <p className="text-3xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
