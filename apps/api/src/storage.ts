import { Injectable, BadRequestException } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
@Injectable()
export class Storage {
  private client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
  });
  private bucket = process.env.S3_BUCKET!;
  async upload(
    file: Express.Multer.File,
    organizationId: string,
    type: string,
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
    const objectKey = `${organizationId}/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: mime,
      }),
    );
    return { objectKey, mimeType: mime, size: file.size };
  }
  async remove(objectKey: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }
  async read(objectKey: string, range?: string) {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Range: range,
      }),
    );
    return result;
  }
}
