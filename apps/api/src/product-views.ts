import { BadRequestException } from "@nestjs/common";
export const PRODUCT_VIEW_POSITIVE =
  "16:9，商品标准四视图，横向排布：第1格为产品正面特写（仅产品主体局部特写，不展示完整底部），第2格完整产品正面、第3格完整产品侧面、第4格完整产品背面，全部是同一个物品，材质、颜色、纹理、包装细节、尺寸比例100%保持一致，严格遵循参考图里物品样貌，不改变产品形态、花纹、包装样式。产品特写：正对镜头，清晰展示表面纹理；三个完整视图：完整展示全部轮廓，严禁裁切产品底部，平稳放置，端正摆放，无倾斜翻转。包装、纹路、色泽、附属配件完全沿用参考图内物品的样式、颜色、材质，细节统一。纯白色纯色背景，均匀柔和无影棚拍平光，干净通透色调，几乎无投影，商业产品写实摄影，高清4K，质感真实自然，无过度锐化。";
export const PRODUCT_VIEW_NEGATIVE =
  "不要文字、标注、线稿、草图、边框、水印、字幕；不要卡通、二次元、手绘、插画；不要变形、扭曲、破损、畸形；不要改变产品外观；完整视图禁止截断；特写图不要展示全部轮廓；不要多余物体、道具、复杂环境背景。卡通，动漫，手绘，线稿，草图，3D渲染Q版，变形，扭曲，残缺破损，裁切截断，特写出现完整产品，文字，logo，水印，标签，箭头，标注，浓重阴影，杂乱背景，场景布景，多余杂物，夸张滤镜";
export const PERSON_VIEW_POSITIVE =
  "16:9，角色标准设定四视图，横向排布：第1格为正面头肩特写（仅头部至肩膀，不包含腰、腿、脚），第2格完整全身正面、第3格完整全身侧面、第4格完整全身背面，全部为同一个人，面部五官、身形、穿搭、肤色发型100%保持一致，严格遵循参考图里人物样貌，不换脸、不改五官特征。头肩特写：正面朝向镜头，中性放松表情，平视前方；三张全身视图：从头到脚尖完整呈现，严禁裁切下半身，双脚平稳踩地，身体挺拔端正站立，自然放松站姿，无夸张动作，中性无表情，正面图平视镜头，侧面图朝向画面左侧，背面图背对镜头。服装、配饰完全沿用参考图内人物的服饰款式、颜色、面料，细节统一；手部细节一致，配饰位置、样式和参考图保持相同。纯白色纯色背景，均匀柔和平光棚拍，韩式清新柔光，低对比干净色调，几乎无投影，电影级写实人像摄影，高清4K，皮肤质感自然真实，无磨皮过度。";
export const PERSON_VIEW_NEGATIVE =
  "不要文字、标注、线稿、草图、边框、水印、字幕；不要卡通、二次元、手绘、插画；不要变形、五官扭曲、肢体穿模；不要改变人物长相、不要明星脸；全身图禁止截断腿部脚部；特写图禁止生成全身；不要多余物体、道具、环境背景。卡通，动漫，手绘，线稿，草图，3D渲染，Q版，变形，畸形肢体，多手指，缺手指，穿模，裁切，截断下半身，特写出现腿脚，全身图缺少脚部，文字，logo，水印，标签，箭头，标注，阴影过重，杂乱背景，户外场景，夸张表情，笑容，整容网红脸，浓妆，过度美颜，蓬松夸张发型，多余配饰";
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
  const multiple = ids.length > 1;
  const image = model.inputs?.find(
    (p: any) => p.type === "image" && Boolean(p.multiple) === multiple,
  );
  const prompt = model.inputs?.find(
    (p: any) => p.type === "text" && !negative(p.id),
  );
  if (!image || !prompt || !model.outputs?.some((p: any) => p.type === "image"))
    throw new BadRequestException(
      multiple
        ? "请选择支持当前参考图数量的多图生成模型"
        : "上传一张参考图时请选择单图生成模型",
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
      .map((f: any) => [f.key, f.defaultValue ?? f.default])
      .filter(([, value]: any[]) => value != null && value !== ""),
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
      throw new BadRequestException(
        `模型参数${field.label || field.key}未配置默认值，请在 CreatKey 中配置`,
      );
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
