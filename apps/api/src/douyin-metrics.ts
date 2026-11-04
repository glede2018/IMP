import { Prisma } from "@prisma/client";
import type { Database } from "./database.js";

const fields = ["views", "likes", "comments", "shares"] as const;
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
      SELECT "capturedAt", views, likes, comments, shares
      FROM "VideoMetricSample" WHERE "videoId"=v.id AND "capturedAt" < ${range.last}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT views, likes, comments, shares FROM "VideoMetricSample"
      WHERE "videoId"=v.id AND "capturedAt" < ${range.first}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) b ON TRUE
    WHERE v."organizationId"=${org} AND v.id IN (${Prisma.join(ids)})
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
      WHERE "accountId"=a.id AND "capturedAt" < ${range.last}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT fans FROM "AccountMetricSample"
      WHERE "accountId"=a.id AND "capturedAt" < ${range.first}
      ORDER BY "capturedAt" DESC LIMIT 1
    ) b ON TRUE
    WHERE a."organizationId"=${org} AND a.id IN (${Prisma.join(ids)})
  `);
  return new Map(rows.map((row) => [row.accountId, row]));
}
