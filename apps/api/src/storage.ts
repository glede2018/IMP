import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { storageObjectKey, type UploadPurpose } from "./storage-object-key.js";
import OSS from "ali-oss";
import { storageConfig } from "../storage-config.mjs";
import type { Readable } from "node:stream";
@Injectable()
export class Storage {
  private readonly config = storageConfig();
  private client?: S3Client;
  private oss?: OSS;
  private signer?: OSS;

  // 公共读文件使用稳定直链，避免列表刷新时重复加载媒体或链接过期。
  async links(asset: {
    id: string;
    objectKey?: string;
    name?: string;
    mimeType?: string;
  }) {
    const fallback = {
      preview: `/api/v1/assets/${asset.id}/file`,
      downloadUrl: `/api/v1/assets/${asset.id}/file?download=1`,
    };
    if (!asset.objectKey?.startsWith("oss://")) return fallback;
    const location = this.location(asset.objectKey);
    const config = storageConfig(process.env, "oss");
    if (config.provider !== "oss" || !config.accessDomain) return fallback;
    const key = location.key.split("/").map(encodeURIComponent).join("/");
    return { ...fallback, preview: `${config.accessDomain}/${key}` };
  }

  // 点击下载时即时生成响应头签名，让浏览器直接从 OSS 保存带中文名称的文件。
  // 下载入口保持稳定，避免把会过期的链接长期保存在页面状态中。
  async downloadLink(asset: {
    objectKey: string;
    name?: string;
    mimeType?: string;
  }) {
    if (!asset.objectKey.startsWith("oss://")) return undefined;
    const location = this.location(asset.objectKey);
    const config = storageConfig(process.env, "oss");
    if (config.provider !== "oss" || !config.accessDomain) return undefined;
    if (!this.signer)
      this.signer = new OSS({
        ...config.options,
        endpoint: config.accessDomain,
        cname: true,
      });
    return this.ossRequest(() =>
      this.signer!.signatureUrlV4(
        "GET",
        3600,
        {
          queries: {
            "response-cache-control": "private, no-store",
            "response-content-disposition": downloadDisposition(asset),
          },
        },
        location.key,
      ),
    );
  }

  private s3() {
    if (!this.client) {
      try {
        const config = storageConfig(process.env, "s3");
        if (config.provider === "s3")
          this.client = new S3Client(config.options);
      } catch {
        throw new ServiceUnavailableException(
          "原有文件存储未配置，请保留 S3 配置以读取历史素材",
        );
      }
    }
    return this.client!;
  }

  private ossClient() {
    if (!this.oss) {
      const config = storageConfig(process.env, "oss");
      if (config.provider === "oss") this.oss = new OSS(config.options);
    }
    return this.oss!;
  }

  // 历史文件继续使用 S3，OSS 文件保留 Bucket 信息。
  // 切换存储方式后，仍按文件原有位置读取和删除。
  private location(objectKey: string) {
    if (!objectKey.startsWith("oss://"))
      return { provider: "s3" as const, key: objectKey };
    const match = /^oss:\/\/([^/]+)\/(.+)$/.exec(objectKey);
    if (!match || match[1] !== process.env.OSS_BUCKET)
      throw new ServiceUnavailableException(
        "该文件的 OSS Bucket 与当前配置不一致",
      );
    return { provider: "oss" as const, key: match[2] };
  }

  private async ossRequest<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "NoSuchKey" || code === "InvalidRange") {
        const normalized = new Error(code);
        normalized.name = code;
        throw normalized;
      }
      // SDK 异常可能包含签名请求，统一转换错误，避免输出密钥。
      throw new ServiceUnavailableException(
        "OSS 文件服务暂时不可用，请检查配置或稍后重试",
      );
    }
  }

  onModuleDestroy() {
    this.client?.destroy();
  }
  async upload(
    file: Express.Multer.File,
    organizationId: string,
    type: string,
    purpose?: UploadPurpose,
  ) {
    const { fileTypeFromBuffer } = await import("file-type");
    let detected: { mime: string } | undefined;
    try {
      detected = await fileTypeFromBuffer(file.buffer);
    } catch {
      throw new BadRequestException("文件损坏或格式无法识别");
    }
    const mime =
      detected?.mime ||
      (type === "copy" &&
      !file.buffer.includes(0) &&
      file.mimetype === "text/plain"
        ? "text/plain"
        : "");
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "audio/mpeg",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "audio/mp4",
      "text/plain",
    ];
    if (!allowed.includes(mime))
      throw new BadRequestException(
        "支持 JPG、PNG、WebP、MP4、MOV、MP3、WAV、OGG 和 TXT 文件",
      );
    if (
      (type === "voice" && !mime.startsWith("audio/")) ||
      (["image", "portrait"].includes(type) && !mime.startsWith("image/")) ||
      (type === "copy" && mime !== "text/plain")
    )
      throw new BadRequestException("文件格式与素材分类不匹配");
    const key = storageObjectKey(organizationId, purpose || type, mime);
    const objectKey =
      this.config.provider === "oss"
        ? `oss://${this.config.bucket}/${key}`
        : key;
    if (this.config.provider === "oss") {
      await this.ossRequest(() =>
        this.ossClient().put(key, file.buffer, {
          headers: { "Content-Type": mime, "x-oss-object-acl": "default" },
        }),
      );
    } else {
      await this.s3().send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: mime,
        }),
      );
    }
    return { objectKey, mimeType: mime, size: file.size };
  }
  async remove(objectKey: string) {
    const location = this.location(objectKey);
    if (location.provider === "oss") {
      await this.ossRequest(() => this.ossClient().delete(location.key));
    } else {
      await this.s3().send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: location.key,
        }),
      );
    }
  }
  async read(
    objectKey: string,
    range?: string,
  ): Promise<{
    Body?: Readable | GetObjectCommandOutput["Body"];
    ContentLength?: number;
    ContentRange?: string;
  }> {
    const location = this.location(objectKey);
    if (location.provider === "oss") {
      return this.ossRequest(async () => {
        const result = await this.ossClient().getStream(location.key, {
          headers: range ? { Range: range } : {},
        });
        const headers = result.res.headers as Record<string, string>;
        return {
          Body: result.stream,
          ContentLength:
            headers["content-length"] === undefined
              ? undefined
              : Number(headers["content-length"]),
          ContentRange: headers["content-range"],
        };
      });
    }
    return this.s3().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: location.key,
        Range: range,
      }),
    );
  }
}

export function downloadDisposition(asset: {
  name?: string;
  mimeType?: string;
}) {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "text/plain": ".txt",
  };
  const extension = extensions[asset.mimeType || ""] || "";
  const name = asset.name || "download";
  const hasExtension =
    name.toLowerCase().endsWith(extension) ||
    (asset.mimeType === "image/jpeg" && /\.jpeg$/i.test(name));
  const filename = hasExtension ? name : name + extension;
  return `attachment; filename*=UTF-8''${encodeURIComponent(filename).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
