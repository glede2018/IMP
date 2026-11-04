import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export const uploadDirectories = {
  product: "products",
  person: "persons",
  portrait: "persons",
  template: "templates",
  voice: "voices",
  video: "videos",
  copy: "texts",
  image: "images",
} as const;
export type UploadPurpose = keyof typeof uploadDirectories;
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "text/plain": "txt",
};

// 所有新文件共用同一规则；保留租户目录，文件后缀依据内容检测结果而非上传文件名。
export function storageObjectKey(
  organizationId: string,
  type: string,
  mime: string,
  date = new Date(),
) {
  if (
    !Object.hasOwn(uploadDirectories, type) ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(organizationId) ||
    !Object.hasOwn(extensions, mime)
  )
    throw new BadRequestException("文件存储分类或格式无效");
  const day = new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  return `${uploadDirectories[type as UploadPurpose]}/${day.slice(0, 4)}/${day.slice(5, 7)}${day.slice(8, 10)}/${organizationId}/${randomUUID()}.${extensions[mime]}`;
}
