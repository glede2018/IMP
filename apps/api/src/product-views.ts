import { BadRequestException } from "@nestjs/common";
export const PRODUCT_VIEW_POSITIVE =
  "产品设定稿，正交投影四视图，横向四格独立分框并排，正视图、侧视图、后视图、俯视图，同一个烘焙产品，外形、裱花、淋面、水果装饰、撒粉、纹理、配色、比例完全一致，无透视，无近大远小，产品水平静止摆放，不倾斜、不旋转，专业食品影棚柔光，光照统一，微弱柔和阴影，纯白色纯色背景，完整展示产品，不裁切，商业食品摄影，8K，超高细节，对焦锐利，奶油光泽自然，面包表皮肌理真实，无多余道具杂物，严格锁定参考造型，所有装饰位置保持不变";
export const PRODUCT_VIEW_NEGATIVE =
  "透视，近大远小，倾斜，旋转，动态，变形，各视图造型不一致，装饰错乱，餐盘，桌布，背景场景，景深，虚化，局部特写，裁切，过曝，强反光，水印，文字，logo，多个不同甜品，阴影过重，等轴测图";
export const PERSON_VIEW_POSITIVE =
  "角色转面三视图，横向三格并排，正交正视图、标准侧视图、标准后视图，同一个人，人脸、发型、服装、身材完全一致，无透视正交投影，全身中立静态站姿，均匀柔光，纯白色背景，轮廓清晰，高清 8K，真实人像，无多余杂物，严格锁定参考图人物样貌，不改变五官特征";
export const PERSON_VIEW_NEGATIVE =
  "透视，倾斜，动态动作，表情变化，脸部不一致，畸形，模糊，文字水印，景深，风景背景，浓重阴影";
export const isMaterialView = (purpose: string) =>
  ["product_views", "person_views"].includes(purpose);
export const viewJobField = (purpose: string) =>
  purpose === "person_views" ? "personViewJobId" : "productViewJobId";
export const viewAssetField = (purpose: string) =>
  purpose === "person_views" ? "personViewAssetId" : "productViewAssetId";
const negative = (key: string) => /negative|负面/.test(key);
// 多张参考图必须全部传入；模型不支持时直接拒绝，不能静默丢图。
export function productViewPayload(
  model: any,
  ids: string[],
  parameters: Record<string, unknown>,
  type = "product",
) {
  const person = type === "person";
  const positivePrompt = person ? PERSON_VIEW_POSITIVE : PRODUCT_VIEW_POSITIVE;
  const negativePrompt = person ? PERSON_VIEW_NEGATIVE : PRODUCT_VIEW_NEGATIVE;
  const image =
    model.inputs?.find((p: any) => p.type === "image" && p.multiple) ||
    (person && ids.length === 1
      ? model.inputs?.find((p: any) => p.type === "image")
      : undefined);
  const prompt = model.inputs?.find(
    (p: any) => p.type === "text" && !negative(p.id),
  );
  if (!image || !prompt || !model.outputs?.some((p: any) => p.type === "image"))
    throw new BadRequestException(
      person
        ? "请选择支持当前参考图数量的图片生成模型"
        : "请选择支持多张参考图的图片生成模型",
    );
  const fields = model.fields || [];
  const max = Math.min(
    image.multiple ? 10 : 1,
    fields.find((f: any) => f.key === image.id)?.maxItems || 10,
  );
  if (!ids.length || ids.length > max)
    throw new BadRequestException(
      `当前模型最多支持 ${max} 张参考图，请更换模型或减少图片`,
    );
  if (
    model.inputs.some(
      (p: any) =>
        p.required && ![image.id, prompt.id].includes(p.id) && !negative(p.id),
    )
  )
    throw new BadRequestException("当前模型包含不支持的必填输入，请更换模型");
  const parameterFields = fields.filter(
    (f: any) => !model.inputs.some((p: any) => p.id === f.key),
  );
  if (
    Object.keys(parameters).some(
      (k) => !parameterFields.some((f: any) => f.key === k),
    )
  )
    throw new BadRequestException("模型参数无效");
  const settings: Record<string, unknown> = Object.fromEntries(
    parameterFields
      .filter((f: any) => f.default !== undefined && f.default !== "")
      .map((f: any) => [f.key, f.default]),
  );
  Object.assign(settings, parameters);
  const negPort = model.inputs.find(
    (p: any) => p.type === "text" && negative(p.id),
  );
  const negField = parameterFields.find((f: any) => negative(f.key));
  if (negField) settings[negField.key] = negativePrompt;
  for (const field of parameterFields) {
    if (["n", "num_images", "num_outputs"].includes(field.key))
      settings[field.key] = 1;
    if (
      field.required &&
      (settings[field.key] == null || settings[field.key] === "")
    )
      throw new BadRequestException(`请填写${field.label}`);
  }
  return {
    inputs: {
      [image.id]: image.multiple ? ids.map((id) => ({ id })) : { id: ids[0] },
      [prompt.id]:
        negPort || negField
          ? positivePrompt
          : `正面提示词：${positivePrompt}\n负面提示词：${negativePrompt}`,
      ...(negPort ? { [negPort.id]: negativePrompt } : {}),
    },
    parameters: settings,
  };
}
