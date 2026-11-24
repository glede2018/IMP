import { metricSource } from "./oneapi.js";
import { Prisma } from "@prisma/client";
import type { Database } from "./database.js";

const fields = ["views", "likes", "comments", "shares", "collects"] as const;
type Metric = (typeof fields)[number];
type Range = { first: Date; last: Date };
type VideoWindow = { videoId: string; capturedAt: Date | null } & Record<
  Metric | `latest_${Metric}`,
  bigint | null
>;
type AccountWindow = {
  accountId: string;
  capturedAt: Date | null;
  fans: bigint | null;
  netFans: bigint | null;
};

// 每个视频仅按索引读取两个边界值，在数据库内计算增量，不加载整月快照。
export async function videoWindowMetrics(
  db: Database,
  org: string,
  ids: string[],
  range: Range,
) {
  if (!ids.length) return new Map<string, VideoWindow>();
  const columns = Prisma.join(
    fields.flatMap((field) => {
      // 列名来自固定白名单，所有用户参数均通过 Prisma 绑定。
      const column = Prisma.raw(`"${field}"`);
      const latest = Prisma.raw(`"latest_${field}"`);
      return [
        Prisma.sql`CASE WHEN l."capturedAt" >= ${range.first}
        THEN CASE WHEN v."publishedAt" >= ${range.first}
          THEN l.${column} ELSE l.${column} - b.${column} END
        ELSE NULL END AS ${column}`,
        Prisma.sql`l.${column} AS ${latest}`,
      ];
    }),
  );
  const rows = await db.$queryRaw<VideoWindow[]>(Prisma.sql`
    SELECT v.id AS "videoId", l."capturedAt", ${columns}
    FROM "PlatformVideo" v
    LEFT JOIN LATERAL (
      SELECT "capturedAt", views, likes, comments, shares, collects
      FROM "VideoMetricSample" WHERE source=${metricSource()} AND "videoId"=v.id AND "capturedAt" < ${range.last}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT views, likes, comments, shares, collects FROM "VideoMetricSample"
      WHERE source=${metricSource()} AND "videoId"=v.id AND "capturedAt" < ${range.first}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) b ON TRUE
    WHERE v.source=${metricSource()} AND v."organizationId"=${org} AND v.id IN (${Prisma.join(ids)})
  `);
  return new Map(rows.map((row) => [row.videoId, row]));
}

// 缺少期初基线或区间内没有观测时返回空值，保留平台修正产生的负增量。
export async function accountWindowMetrics(
  db: Database,
  org: string,
  ids: string[],
  range: Range,
) {
  if (!ids.length) return new Map<string, AccountWindow>();
  const rows = await db.$queryRaw<AccountWindow[]>(Prisma.sql`
    SELECT a.id AS "accountId", l."capturedAt",
      CASE WHEN l."capturedAt" >= ${range.first} THEN l.fans ELSE NULL END AS fans,
      CASE WHEN l."capturedAt" >= ${range.first} THEN l.fans - b.fans ELSE NULL END AS "netFans"
    FROM "Account" a
    LEFT JOIN LATERAL (
      SELECT "capturedAt", fans FROM "AccountMetricSample"
      WHERE source=${metricSource()} AND "accountId"=a.id AND "capturedAt" < ${range.last}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT fans FROM "AccountMetricSample"
      WHERE source=${metricSource()} AND "accountId"=a.id AND "capturedAt" < ${range.first}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) b ON TRUE
    WHERE a."organizationId"=${org} AND a.id IN (${Prisma.join(ids)})
  `);
  return new Map(rows.map((row) => [row.accountId, row]));
}

// 按北京时间逐日读取快照边界，缺少历史基线的日期保留空值。
export async function videoDailyViews(
  db: Database,
  org: string,
  ids: string[],
  range: Range,
) {
  const days: Date[] = [];
  for (
    let time = range.first.getTime();
    time < range.last.getTime();
    time += 86400000
  )
    days.push(new Date(time));
  if (!ids.length)
    return days.map((date) => ({ date: date.toISOString(), views: null }));
  const rows = await db.$queryRaw<
    { date: Date; views: bigint | null }[]
  >(Prisma.sql`
    SELECT d.day AS date,
      CASE WHEN COUNT(*) = COUNT(m.views) THEN SUM(m.views) ELSE NULL END AS views
    FROM generate_series(${range.first}::timestamptz, ${range.last}::timestamptz - INTERVAL '1 day', INTERVAL '1 day') d(day)
    LEFT JOIN LATERAL (
      SELECT CASE WHEN l."capturedAt" >= d.day
        THEN CASE WHEN v."publishedAt" >= d.day THEN l.views ELSE l.views - b.views END
        ELSE NULL END AS views
      FROM "PlatformVideo" v
      LEFT JOIN LATERAL (
        SELECT "capturedAt", views FROM "VideoMetricSample"
        WHERE source=${metricSource()} AND "videoId"=v.id AND "capturedAt" < d.day + INTERVAL '1 day'
        ORDER BY "capturedAt" DESC LIMIT 1
      ) l ON TRUE
      LEFT JOIN LATERAL (
        SELECT views FROM "VideoMetricSample"
        WHERE source=${metricSource()} AND "videoId"=v.id AND "capturedAt" < d.day
        ORDER BY "capturedAt" DESC LIMIT 1
      ) b ON TRUE
      WHERE v.source=${metricSource()} AND v."organizationId"=${org}
        AND v.id IN (${Prisma.join(ids)}) AND v."publishedAt" < d.day + INTERVAL '1 day'
    ) m ON TRUE
    GROUP BY d.day ORDER BY d.day
  `);
  return rows.map((r) => ({
    date: r.date.toISOString(),
    views: r.views == null ? null : Number(r.views),
  }));
}
