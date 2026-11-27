const fields = ["views", "likes", "comments", "shares", "collects"] as const;
const interactions = ["likes", "comments", "shares", "collects"] as const;
type Metrics = Record<(typeof fields)[number], number | null>;

export function sumKnown(values: (number | null)[]) {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

// 缺失快照不计为零；只汇总可计算的区间增量，并保留每项的覆盖数量。
export function summarizeVideoMetrics(rows: { metrics: Metrics }[]) {
  const metrics = {} as Metrics;
  const metricCoverage = { total: rows.length } as Record<
    keyof Metrics | "total",
    number
  >;
  const rates = {} as Record<(typeof interactions)[number], number | null>;
  const rateCoverage = {} as Record<(typeof interactions)[number], number>;
  for (const field of fields) {
    const values = rows.flatMap((row) =>
      row.metrics[field] == null ? [] : [row.metrics[field]!],
    );
    metricCoverage[field] = values.length;
    metrics[field] = sumKnown(values);
  }
  for (const field of interactions) {
    // 分子分母使用相同的视频集合，避免不同指标的缺失范围造成比例失真。
    const paired = rows.filter(
      (row) => row.metrics.views != null && row.metrics[field] != null,
    );
    const views = paired.reduce((sum, row) => sum + row.metrics.views!, 0);
    const count = paired.reduce((sum, row) => sum + row.metrics[field]!, 0);
    rateCoverage[field] = paired.length;
    rates[field] = views > 0 ? count / views : null;
  }
  return { metrics, metricCoverage, rates, rateCoverage };
}
