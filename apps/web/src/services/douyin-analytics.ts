import { request, save } from "./api";
export type LiveMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};
export type SyncAccount = {
  id: string;
  name: string;
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
export type TrackingTag = {
  id: string;
  templateId: string | null;
  tag: string;
  version: string;
  titleSnapshot: string;
};
export type LiveVideo = {
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
  start: string;
  end: string;
  basis: string;
  syncedAt: string | null;
  summary: LiveMetrics & {
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
    type: string;
    store: string | null;
    published: number;
    metrics: LiveMetrics;
    fans: number | null;
    fansCapturedAt: string | null;
    netFans: number | null;
  }[];
  videos: LiveVideo[];
  templates: {
    id: string;
    templateId: string;
    title: string;
    version: string;
    tag: string;
    published: number;
    videoCount: number;
    accounts: number;
    metrics: LiveMetrics;
    average: number | null;
  }[];
  trading: { status: string; message: string };
};
export const fetchSyncStatus = () =>
  request<SyncAccount[]>("/analytics/douyin/status");
export const fetchLiveOverview = (params: {
  start: string;
  end: string;
  accountId: string;
  type: string;
}) =>
  request<LiveOverview>(
    `/analytics/douyin/overview?${new URLSearchParams(params)}`,
  );
export const enqueueSync = (id: string) =>
  save<SyncAccount[]>(
    `/analytics/douyin/accounts/${encodeURIComponent(id)}/sync`,
    {},
  );
export const fetchTrackingTags = () =>
  request<TrackingTag[]>("/analytics/douyin/tags");
export const addTrackingTag = (data: {
  templateId: string;
  tag: string;
  version: string;
}) => save<TrackingTag>("/analytics/douyin/tags", data);
export const rematchTags = () =>
  save<{ processed: number }>("/analytics/douyin/tags/rematch", {});
