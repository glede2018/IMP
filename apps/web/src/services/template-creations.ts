import { request, save } from "./api";
import type { Template } from "@/types";
export type CreationTemplate = Template & {
  revision: number;
  cover?: string | null;
};
export type PublishTag = {
  id: string;
  tag: string;
  name: string;
  code: string | null;
};
export type CreationContext = {
  template: CreationTemplate;
  trackingTag: PublishTag;
  tags: PublishTag[];
  execution?: { ready: boolean; reason: string | null };
};
export type PickMaterial = {
  id: string;
  name: string;
  description: string;
  materialDescription?: string;
  type: "person" | "product";
  isDefault: boolean;
  files: { id: string; url: string; label: string; mimeType: string }[];
};
export const prepareCreation = (id: string) =>
  save<CreationContext>(`/templates/${id}/prepare`, {});
export const creationMaterials = (type: "person" | "product", q: string) =>
  request<PickMaterial[]>(
    `/templates/creation-materials?${new URLSearchParams({ type, q })}`,
  );
export type CreationInput = {
  title: string;
  revision: number;
  personMaterialId?: string;
  productMaterialIds?: string[];
  slotValues?: Record<
    string,
    { materialId?: string; assetId?: string; text?: string }
  >;
  tagIds: string[];
  requestId: string;
};
export const saveCreation = (id: string, data: CreationInput) =>
  save<{ id: string; status: string; publishTags: string[] }>(
    `/templates/${id}/creations`,
    data,
  );

export type WorkflowRun = {
  id: string;
  status: string;
  error: string | null;
  nodes: { id: string; label: string; status: string }[];
};
export const workflowRun = (id: string) =>
  request<WorkflowRun>(`/templates/creations/${id}`);
export const startWorkflow = (id: string) =>
  save<WorkflowRun>(`/templates/creations/${id}/start`, {});
