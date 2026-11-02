import { getPage, request, save } from "./api";
export interface MaterialFile {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  label?: string;
}
export interface Material {
  id: string;
  type: "product" | "person";
  name: string;
  description: string;
  categoryId?: string;
  categoryPath: string[];
  tags: string[];
  priceCents: number;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  generationStatus: string;
  voiceAssetId?: string;
  voiceName?: string;
  files: MaterialFile[];
}
export interface Voice {
  id: string;
  name: string;
  sampleUrl: string;
}
export interface MaterialInput {
  type: Material["type"];
  name: string;
  description: string;
  categoryId?: string;
  categoryPath: string[];
  tags: string[];
  priceCents: number;
  fileIds: string[];
  voiceAssetId?: string;
  isDefault: boolean;
}
export const fetchMaterials = (
  params: Record<string, string | number | undefined>,
) => getPage<Material>("/materials", params);
export const fetchVoices = () => request<Voice[]>("/materials/voices");
export const saveMaterial = (data: MaterialInput, id?: string) =>
  save<Material>(`/materials${id ? `/${id}` : ""}`, data, id ? "PUT" : "POST");
export interface MaterialCategory {
  id: string;
  name: string;
  parentId: string | null;
  sort: number;
  system: boolean;
  createdAt: string;
  _count: { materials: number };
}
export const fetchCategories = () =>
  request<MaterialCategory[]>("/material-categories");
export interface CategoryOption {
  value: string;
  label: string;
  children?: CategoryOption[];
}
export function categoryOptions(
  rows: MaterialCategory[],
  parentId: string | null = null,
): CategoryOption[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .map((r) => {
      const children = categoryOptions(rows, r.id);
      return {
        value: r.id,
        label: r.name,
        ...(children.length ? { children } : {}),
      };
    });
}
export function categoryIds(rows: MaterialCategory[], id?: string) {
  const path: string[] = [];
  let row = rows.find((r) => r.id === id);
  while (row) {
    path.unshift(row.id);
    row = rows.find((r) => r.id === row!.parentId);
  }
  return path;
}
