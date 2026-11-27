import { request } from "./api";
export type LiveMetrics = {
  collects?: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};
export type MetricCoverage = Record<keyof LiveMetrics | "total", number>;
export type InteractionRates = Record<
  "likes" | "comments" | "shares" | "collects",
  number | null
>;
export type SyncAccount = {
  id: string;
  name: string;
  platform: string;
  type: string;
  mode: string;
  scopes: string[];
  states: {
    kind: string;
    status: string;
    message: string;
    processed: number;
    cursorPending: boolean;
    lastSuccessAt: string | null;
    lastAttemptAt: string | null;
    nextAttemptAt: string | null;
  }[];
};
export type LiveVideo = {
  coverUrl?: string | null;
  id: string;
  remoteId: string;
  title: string;
  accountId: string;
  publishedAt: string;
  tags: string[];
  matchStatus: string;
  template: {
    id: string;
    templateId: string;
    title: string;
    version: string;
    tag: string;
  } | null;
  metrics: LiveMetrics;
  capturedAt: string | null;
  latest: LiveMetrics | null;
};
export type LiveOverview = {
  source: "live";
  content: {
    generated: number | null;
    pending: number | null;
    failed: number | null;
    publishedWorks: number | null;
    playedWorks: number | null;
    pendingPublish: number | null;
    trend: { date: string; views: number | null }[];
    previous: {
      published: number;
      views: number | null;
      netFans: number | null;
    };
  };
  start: string;
  end: string;
  basis: string;
  syncedAt: string | null;
  summary: LiveMetrics & {
    rates: InteractionRates;
    metricCoverage: MetricCoverage;
    published: number;
    participating: number;
    fans: number | null;
    netFans: number | null;
    videoCount: number;
    measuredVideos: number;
    unmatched: number;
    conflicts: number;
  };
  accounts: {
    id: string;
    name: string;
    platform: string;
    type: string;
    store: string | null;
    published: number;
    metrics: LiveMetrics;
    metricCoverage: MetricCoverage;
    rates: InteractionRates;
    rateCoverage: Record<keyof InteractionRates, number>;
    fans: number | null;
    fansCapturedAt: string | null;
    netFans: number | null;
  }[];
  videos: LiveVideo[];
  templates: {
    rates: InteractionRates;
    id: string;
    templateId: string;
    title: string;
    version: string;
    tag: string;
    published: number;
    videoCount: number;
    works: number | null;
    accounts: number;
    metrics: LiveMetrics;
    metricCoverage: MetricCoverage;
    average: number | null;
  }[];
  trading: { status: string; message: string };
};
export const fetchSyncStatus = () =>
  request<SyncAccount[]>("/analytics/social/status");
export const fetchLiveOverview = (params: {
  start: string;
  end: string;
  accountId: string;
  type: string;
  platform?: string;
}) =>
  request<LiveOverview>(
    `/analytics/social/overview?${new URLSearchParams({ ...params })}`,
  );
