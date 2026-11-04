import "../load-env.mjs";
import OSS from "ali-oss";
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { storageConfig } from "../storage-config.mjs";

const config = storageConfig();
if (config.provider === "oss") {
  // 云端 Bucket 需提前创建，此处仅检查可用性，不创建或更改权限。
  try {
    await new OSS(config.options).getBucketInfo(config.bucket);
    console.log("OSS bucket is ready.");
  } catch {
    throw new Error(
      "OSS bucket check failed: check bucket, region, network and RAM GetBucketInfo permission",
    );
  }
} else {
  const client = new S3Client(config.options);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        try {
          await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        } catch (error) {
          if (error.$metadata?.httpStatusCode !== 404) throw error;
          await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
        }
        console.log("Private storage bucket is ready.");
        break;
      } catch (error) {
        if (attempt === 29) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } finally {
    client.destroy();
  }
}
