import { getPage, request } from "./api";
export type WorkTaskStatus =
  "awaiting_provider" | "queued" | "generating" | "completed" | "failed";
export interface LibraryWork {
  id: string;
  kind: "work" | "creation";
  title: string;
  createdAt: string;
  taskStatus: WorkTaskStatus;
  caption: string;
  publishTags: string[];
  materials: { id: string; name: string; type: "person" | "product" }[];
  templateId: string | null;
  templateName: string | null;
  generationSeconds: number | null;
  width: number | null;
  height: number | null;
  size: number | null;
  mimeType: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
}
export interface WorkFilters {
  q?: string;
  personId?: string;
  productId?: string;
  templateId?: string;
  status?: string;
  from?: string;
  to?: string;
}
export type FilterOption = { value: string; label: string };
export const fetchWorkLibrary = (
  params: WorkFilters & { page: number; pageSize: number },
) => getPage<LibraryWork>("/works/library", { ...params });
export const fetchWorkOptions = () =>
  request<{
    persons: FilterOption[];
    products: FilterOption[];
    templates: FilterOption[];
  }>("/works/library/options");
export const hashtags = (tags: string[]) =>
  [...new Set(tags.map((t) => t.trim().replace(/^#+/, "")).filter(Boolean))]
    .map((t) => `#${t}`)
    .join(" ");
export const downloadable = (w: LibraryWork) =>
  w.taskStatus === "completed" &&
  !!w.downloadUrl &&
  !!w.mimeType?.startsWith("video/");
