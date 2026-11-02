/** Frontend-only fixture. Replace this data boundary with API DTOs when integration is ready. */
export const DEMO_PERIOD = ["2026-10-12", "2026-10-18"] as const;
export const ACCOUNT_TYPES = {
  brand: "品牌",
  personal_ip: "职人",
  store_ip: "门店",
} as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;
export type Metrics = {
  views: number;
  likes: number;
  comments: number;
  shares: number;
};
export type DemoAccount = {
  id: string;
  name: string;
  type: AccountType;
  store: string;
  fans: number;
};
export const demoAccounts: DemoAccount[] = Array.from(
  { length: 18 },
  (_, i) => ({
    id: `account-${i + 1}`,
    name:
      [
        "小林的烘焙日记",
        "御品轩 · 小雅",
        "面包师阿哲",
        "御品轩官方",
        "御品轩高新店",
        "御品轩曲江店",
        "御品轩钟楼店",
      ][i] ||
      `御品轩 · ${["小周", "小陈", "小雨", "阿敏", "小夏", "小叶", "阿宁", "小秋", "小麦", "阿泽", "小糖"][i - 7]}`,
    type: i === 3 ? "brand" : i >= 4 && i <= 6 ? "store_ip" : "personal_ip",
    store: ["高新店", "曲江店", "钟楼店"][i >= 4 && i <= 6 ? i - 4 : i % 3],
    fans: 6800 + (18 - i) * 420,
  }),
);
export const demoTemplates = [
  ["秋日新品 · 温暖开箱", "v1.2"],
  ["现烤出炉 · 门店日常", "v2.0"],
  ["节日礼遇 · 心意礼盒", "v1.0"],
  ["早餐灵感 · 元气早晨", "v1.1"],
  ["匠心手作 · 烘焙故事", "v1.0"],
  ["人气推荐 · 今日必吃", "v1.3"],
  ["秋日新品 · 温暖开箱", "v1.3"],
  ["门店探访 · 甜蜜时光", "v1.0"],
].map(([name, version], i) => ({
  id: `template-${i + 1}`,
  name,
  version,
  tag: `#御品轩T${String(i + 1).padStart(3, "0")}${version.replaceAll(".", "")}`,
}));
const day = (offset: number) =>
  `2026-10-${String(5 + offset).padStart(2, "0")}`;
export const demoWorks = Array.from({ length: 144 }, (_, i) => ({
  id: `work-${i + 1}`,
  templateId: demoTemplates[i % 8].id,
  date: day(i < 48 ? i % 7 : 7 + ((i - 48) % 7)),
}));
export type DemoVideo = {
  id: string;
  title: string;
  accountId: string;
  templateId: string;
  workId: string;
  publishedAt: string;
  tag: string;
  daily: (Metrics & { date: string })[];
};
export const demoVideos: DemoVideo[] = Array.from({ length: 176 }, (_, i) => {
  const work = demoWorks[i < 48 ? i : 48 + ((i - 48) % 80)];
  const template = demoTemplates.find((t) => t.id === work.templateId)!;
  const publishDay = Number(work.date.slice(-2)) - 5;
  return {
    id: `DY${2026100000 + i}`,
    title: [
      "秋天第一口板栗吐司",
      "把下午茶装进礼盒",
      "早上七点，面包刚出炉",
      "一起看看今日现烤",
      "一口尝到秋天的温柔",
      "面包师的手作日常",
    ][(i + Math.floor(i / 18)) % 6],
    accountId: demoAccounts[i % 18].id,
    templateId: template.id,
    workId: work.id,
    publishedAt: `${day(publishDay)} ${String(9 + (i % 10)).padStart(2, "0")}:30`,
    tag: template.tag,
    daily: Array.from({ length: 14 - publishDay }, (_, j) => {
      const views = i % 20 === 0 ? 0 : 400 + ((i * 173 + j * 251) % 1800);
      return {
        date: day(publishDay + j),
        views,
        likes: Math.floor(views * (0.03 + (i % 8) / 1000)),
        comments: Math.floor(views * 0.0028),
        shares: Math.floor(views * 0.0024),
      };
    }),
  };
});
export type DemoOrder = {
  id: string;
  accountId: string | null;
  paidAt: string;
  amount: number;
  refundAt: string | null;
  refund: number;
  coupons: {
    id: string;
    amount: number;
    redeemedAt: string | null;
    refunded: boolean;
  }[];
};
export const demoOrders: DemoOrder[] = Array.from({ length: 1092 }, (_, i) => {
  const current = i >= 364;
  const index = current ? i - 364 : i;
  const paidDay = (current ? 7 : 0) + (index % 7);
  const amount = [3990, 5990, 6990, 8990][i % 4];
  const refundAt = i % 13 === 0 ? day(Math.min(paidDay + 2, 13)) : null;
  const count = i % 3 === 0 ? 2 : 1;
  return {
    id: `ORDER${100000 + i}`,
    accountId: index < (current ? 642 : 320) ? demoAccounts[i % 18].id : null,
    paidAt: day(paidDay),
    amount,
    refundAt,
    refund: refundAt ? Math.floor(amount / count) : 0,
    coupons: Array.from({ length: count }, (_, c) => ({
      id: `COUPON${i}-${c}`,
      amount: Math.floor(amount / count),
      refunded: !!refundAt && c === 0,
      redeemedAt:
        refundAt && c === 0
          ? null
          : i % 5 < 3
            ? day(Math.min(paidDay + 1 + c, 13))
            : null,
    })),
  };
});
export const inPeriod = (date: string | null, start: string, end: string) =>
  !!date && date.slice(0, 10) >= start && date.slice(0, 10) <= end;
const zero = (): Metrics => ({ views: 0, likes: 0, comments: 0, shares: 0 });
const add = (a: Metrics, b: Metrics): Metrics => ({
  views: a.views + b.views,
  likes: a.likes + b.likes,
  comments: a.comments + b.comments,
  shares: a.shares + b.shares,
});
const unique = (ids: string[]) => new Set(ids).size;
export const sum = <T>(rows: T[], value: (row: T) => number) =>
  rows.reduce((total, row) => total + value(row), 0);
export const rate = (value: number, total: number) =>
  total ? `${((value / total) * 100).toFixed(2)}%` : "—";
export const money = (cents: number) =>
  `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const number = (value: number) => value.toLocaleString("zh-CN");
export const compact = (value: number) =>
  value >= 10000 ? `${(value / 10000).toFixed(1)}万` : number(value);

export function getDemoAnalytics(
  start: string,
  end: string,
  accountId = "all",
  type = "all",
) {
  const accounts = demoAccounts.filter(
    (a) =>
      (accountId === "all" || a.id === accountId) &&
      (type === "all" || a.type === type),
  );
  const accountIds = new Set(accounts.map((a) => a.id));
  const videos = demoVideos
    .filter(
      (v) => accountIds.has(v.accountId) && v.publishedAt.slice(0, 10) <= end,
    )
    .map((v) => ({
      ...v,
      metrics: v.daily
        .filter((d) => inPeriod(d.date, start, end))
        .reduce(add, zero()),
    }))
    .filter((v) => inPeriod(v.publishedAt, start, end) || v.metrics.views > 0);
  const published = videos.filter((v) => inPeriod(v.publishedAt, start, end));
  const metrics = videos.reduce((a, v) => add(a, v.metrics), zero());
  const dates = Array.from({ length: 14 }, (_, i) => day(i)).filter((d) =>
    inPeriod(d, start, end),
  );
  const fanGain = (a: DemoAccount) =>
    sum(
      dates,
      (d) => 8 + ((Number(d.slice(-2)) * 3 + demoAccounts.indexOf(a) * 7) % 26),
    );
  const accountRows = accounts
    .map((a) => ({
      ...a,
      published: published.filter((v) => v.accountId === a.id).length,
      metrics: videos
        .filter((v) => v.accountId === a.id)
        .reduce((m, v) => add(m, v.metrics), zero()),
      netFans: fanGain(a),
    }))
    .filter((a) => a.published > 0 || a.metrics.views > 0)
    .sort((a, b) => b.metrics.views - a.metrics.views);
  // Work generation has no account dimension before manual publication.
  const works = demoWorks.filter((w) => inPeriod(w.date, start, end));
  const templateRows = demoTemplates
    .map((t) => {
      const related = videos.filter((v) => v.templateId === t.id);
      const m = related.reduce((a, v) => add(a, v.metrics), zero());
      return {
        ...t,
        works: works.filter((w) => w.templateId === t.id).length,
        published: published.filter((v) => v.templateId === t.id).length,
        accounts: unique(related.map((v) => v.accountId)),
        videoCount: related.length,
        metrics: m,
        average: related.length ? Math.round(m.views / related.length) : 0,
      };
    })
    .filter((t) => t.works > 0 || t.videoCount > 0)
    .sort((a, b) => b.metrics.views - a.metrics.views);
  const attributed = demoOrders.filter(
    (o) => o.accountId && accountIds.has(o.accountId),
  );
  const paid = attributed.filter((o) => inPeriod(o.paidAt, start, end));
  const refunds = attributed.filter((o) => inPeriod(o.refundAt, start, end));
  const redeemed = attributed.flatMap((o) =>
    o.coupons.filter((c) => inPeriod(c.redeemedAt, start, end)),
  );
  const coupons = paid.flatMap((o) =>
    o.coupons.filter((c) => !c.refunded || !o.refundAt || o.refundAt > end),
  );
  const redeemedCohort = coupons.filter(
    (c) => c.redeemedAt && c.redeemedAt <= end,
  ).length;
  const orderRows = accounts
    .map((a) => ({
      ...a,
      orders: paid.filter((o) => o.accountId === a.id).length,
      amount: sum(
        paid.filter((o) => o.accountId === a.id),
        (o) => o.amount,
      ),
      refund: sum(
        refunds.filter((o) => o.accountId === a.id),
        (o) => o.refund,
      ),
      redeemed: sum(
        attributed.filter((o) => o.accountId === a.id),
        (o) =>
          o.coupons.filter((c) => inPeriod(c.redeemedAt, start, end)).length,
      ),
      redeemedAmount: sum(
        attributed.filter((o) => o.accountId === a.id),
        (o) =>
          sum(
            o.coupons.filter((c) => inPeriod(c.redeemedAt, start, end)),
            (c) => c.amount,
          ),
      ),
    }))
    .filter((a) => a.orders || a.redeemed || a.refund)
    .sort((a, b) => b.amount - a.amount);
  const worksPublished = works.filter((w) =>
    videos.some((v) => v.workId === w.id),
  );
  const worksPlayed = worksPublished.filter((w) =>
    videos.some(
      (v) =>
        v.workId === w.id && v.daily.some((d) => d.date <= end && d.views > 0),
    ),
  );
  return {
    accounts,
    videos,
    published,
    metrics,
    accountRows,
    templateRows,
    works,
    worksPublished,
    worksPlayed,
    orderRows,
    fans: dates.length
      ? sum(
          accounts,
          (a) =>
            a.fans +
            sum(
              Array.from({ length: 14 }, (_, i) => day(i)).filter(
                (d) => d <= end,
              ),
              (d) =>
                8 +
                ((Number(d.slice(-2)) * 3 + demoAccounts.indexOf(a) * 7) % 26),
            ),
        )
      : null,
    netFans: sum(accounts, fanGain),
    participating: unique(published.map((v) => v.accountId)),
    trend: dates.map((date) => ({
      date: date.slice(5),
      views: sum(
        videos,
        (v) => v.daily.find((d) => d.date === date)?.views || 0,
      ),
    })),
    paidCount: paid.length,
    paidAmount: sum(paid, (o) => o.amount),
    refundAmount: sum(refunds, (o) => o.refund),
    redeemedCount: redeemed.length,
    redeemedAmount: sum(redeemed, (c) => c.amount),
    unattributed:
      accountId === "all" && type === "all"
        ? demoOrders.filter(
            (o) => !o.accountId && inPeriod(o.paidAt, start, end),
          ).length
        : null,
    coupons: coupons.length,
    redeemedCohort,
  };
}
export type DemoAnalytics = ReturnType<typeof getDemoAnalytics>;
export type VideoRow = DemoAnalytics["videos"][number];
