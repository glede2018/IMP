import type { Prisma } from "@prisma/client";
import { matchTrackingTags } from "./douyin-data-provider.js";
export async function templateTagBindings(
  tx: Prisma.TransactionClient,
  organizationId: string,
  activeOnly = true,
) {
  const available = activeOnly ? { active: true, deletedAt: null } : {};
  const [legacy, managed] = await Promise.all([
    tx.templateTrackingTag.findMany({
      where: { organizationId, templateId: { not: null }, ...available },
    }),
    tx.templateTagBinding.findMany({
      where: { organizationId, tag: { organizationId, ...available } },
      include: { tag: true },
    }),
  ]);
  return [
    ...legacy.map((b) => ({ ...b, source: "legacy" as const })),
    ...managed.map(({ tag, ...binding }) => ({
      ...binding,
      tag: tag.tag,
      active: tag.active,
      deletedAt: tag.deletedAt,
      source: "managed" as const,
    })),
  ];
}
export function matchVideoTags(
  tags: string[],
  bindings: Awaited<ReturnType<typeof templateTagBindings>>,
) {
  // 旧视频若仍携带唯一的系统标签，优先沿用明确归属，避免通用标签造成历史冲突。
  const historical = bindings.filter(
    (b) => b.source === "legacy" && b.systemGenerated && tags.includes(b.tag),
  );
  const match = matchTrackingTags(
    tags,
    historical.length ? historical : bindings,
  );
  const binding = bindings.find((b) => b.id === match.bindingId);
  return {
    matchStatus: match.matchStatus,
    bindingId: binding?.source === "legacy" ? binding.id : null,
    templateTagBindingId: binding?.source === "managed" ? binding.id : null,
  };
}
// 新关联与历史自动标签均可读取，停用标签时仍保留已确认的视频归属。
export function videoTagBinding(video: {
  binding: {
    id: string;
    templateId: string | null;
    version: string;
    titleSnapshot: string;
    tag: string;
    active: boolean;
    deletedAt: Date | null;
  } | null;
  templateTagBinding: {
    id: string;
    templateId: string;
    version: string;
    titleSnapshot: string;
    tag: { tag: string; active: boolean; deletedAt: Date | null };
  } | null;
}) {
  if (video.templateTagBinding) {
    const { tag, ...binding } = video.templateTagBinding;
    return {
      ...binding,
      tag: tag.tag,
      active: tag.active,
      deletedAt: tag.deletedAt,
    };
  }
  return video.binding;
}
