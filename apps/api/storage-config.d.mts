import type OSS from "ali-oss";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
export function storageConfig(
  env?: NodeJS.ProcessEnv,
  provider?: string,
):
  | {
      provider: "oss";
      bucket: string;
      options: OSS.Options;
      accessDomain?: string;
    }
  | { provider: "s3"; bucket: string; options: S3ClientConfig };
