import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Storage } from "./storage.js";
export type RemoteTemplate = {
  id: string;
  title: string;
  description: string;
  cover: { url: string } | null;
  previewVideo?: { url: string; type: "video" } | null;
  sourceHash: string;
  compatible: boolean;
  reason: string | null;
  slots: {
    id: string;
    label: string;
    description: string;
    preview: string | null;
  }[];
  estimatedKeys: number;
  templateFeeKeys: number;
};
export type RemoteJob = {
  id: string;
  status:
    "submitting" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  error?: string;
  costKeys: number;
  outputs: {
    id: string;
    url: string;
    type: string;
    mimeType: string;
    name: string;
  }[];
};
export class CreatKeyConnectionError extends ServiceUnavailableException {
  retryable = true;
}
@Injectable()
export class CreatKeyClient {
  constructor(private storage: Storage) {}
  ready() {
    return (
      !!process.env.CREATKEY_API_URL?.trim() &&
      !!process.env.CREATKEY_API_KEY?.trim()
    );
  }
  private base() {
    if (!this.ready())
      throw new ServiceUnavailableException("尚未配置 CreatKey API 地址和密钥");
    let url: URL;
    try {
      url = new URL(process.env.CREATKEY_API_URL!.trim());
    } catch {
      throw new ServiceUnavailableException("CreatKey API 地址格式无效");
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "host.docker.internal"].includes(
            url.hostname,
          )
        ))
    )
      throw new ServiceUnavailableException(
        "CreatKey API 地址需要 HTTPS；本机开发可使用 HTTP",
      );
    return url.toString().replace(/\/$/, "");
  }
  async request<T>(
    path: string,
    tenantId: string,
    body?: object | FormData,
    key?: string,
  ): Promise<T> {
    const base = this.base();
    let response: Response;
    try {
      response = await fetch(base + path, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: {
          Authorization: `Bearer ${process.env.CREATKEY_API_KEY!.trim()}`,
          "X-External-Tenant": tenantId,
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body
          ? { body: body instanceof FormData ? body : JSON.stringify(body) }
          : {}),
      });
    } catch {
      throw new CreatKeyConnectionError(
        "CreatKey 连接暂时不可用，任务会自动查询，不重复计费提交",
      );
    }
    if ([401, 403].includes(response.status))
      throw new CreatKeyConnectionError(
        "CreatKey 授权暂不可用，请检查 API 密钥、应用状态和接口权限",
      );
    if (response.status === 429 || response.status >= 500)
      throw new CreatKeyConnectionError(
        `CreatKey 服务暂时不可用（${response.status}）`,
      );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new BadRequestException(
        typeof data.message === "string"
          ? data.message.slice(0, 300)
          : `CreatKey 请求被拒绝（${response.status}）`,
      );
    }
    const content = await response.text();
    if (content.length > 2 * 1024 * 1024)
      throw new BadRequestException("CreatKey 返回数据过大");
    return JSON.parse(content) as T;
  }
  template(org: string, id: string) {
    return this.request<RemoteTemplate>(
      `/templates/${encodeURIComponent(id)}`,
      org,
    );
  }
  job(org: string, id: string) {
    return this.request<RemoteJob>(`/jobs/${encodeURIComponent(id)}`, org);
  }
  async upload(org: string, asset: any) {
    const source = await this.storage.read(asset.objectKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const part of source.Body as AsyncIterable<Uint8Array>) {
      size += part.length;
      if (size > 20 * 1024 * 1024)
        throw new BadRequestException("输入素材不能超过 20 MB");
      chunks.push(Buffer.from(part));
    }
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.concat(chunks)], { type: asset.mimeType }),
      asset.name,
    );
    return this.request<{ id: string; type: string }>(
      "/assets/import",
      org,
      form,
    );
  }
  async download(
    urlString: string,
    kind: "image" | "video",
    maxImageBytes = 3 * 1024 * 1024,
  ) {
    const base = new URL(this.base()),
      url = new URL(urlString, base);
    const allowed = (process.env.CREATKEY_MEDIA_HOSTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (
      url.username ||
      url.password ||
      url.hash ||
      !(
        allowed.includes(url.hostname.toLowerCase()) ||
        url.origin === base.origin
      ) ||
      (url.protocol !== "https:" && url.origin !== base.origin)
    )
      throw new BadRequestException("CreatKey 媒体地址不在允许的域名中");
    const max = kind === "image" ? maxImageBytes : 50 * 1024 * 1024;
    let r: Response;
    try {
      r = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new CreatKeyConnectionError("生成结果连接暂时不可用，将重试归档");
    }
    if (!r.ok || !r.body)
      throw new CreatKeyConnectionError("生成结果暂时无法下载，将重试归档");
    if (Number(r.headers.get("content-length")) > max)
      throw new BadRequestException("生成文件超过素材大小限制");
    const reader = r.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max)
          throw new BadRequestException("生成文件超过素材大小限制");
        chunks.push(Buffer.from(value));
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new CreatKeyConnectionError("生成结果下载中断，将重试归档");
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return {
      buffer: Buffer.concat(chunks),
      size,
      mimetype:
        r.headers.get("content-type")?.split(";")[0] ||
        (kind === "image" ? "image/png" : "video/mp4"),
      originalname: kind === "image" ? "生成图片.png" : "生成视频.mp4",
    } as Express.Multer.File;
  }
}
