// API 与存储初始化命令共用配置校验，禁止记录访问密钥。
export function storageConfig(
  env = process.env,
  provider = env.STORAGE_PROVIDER || "s3",
) {
  const required =
    provider === "oss"
      ? [
          "OSS_REGION",
          "OSS_BUCKET",
          "OSS_ACCESS_KEY_ID",
          "OSS_ACCESS_KEY_SECRET",
        ]
      : ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
  if (!["s3", "oss"].includes(provider))
    throw new Error("STORAGE_PROVIDER must be s3 or oss");
  for (const key of required) {
    if (!env[key]?.trim())
      throw new Error(`Missing environment variable: ${key}`);
  }
  if (provider === "oss") {
    const accessDomain = env.OSS_ACCESS_DOMAIN?.trim() || undefined;
    if (accessDomain) {
      let url;
      try {
        url = new URL(accessDomain);
      } catch {
        throw new Error("OSS_ACCESS_DOMAIN 必须是 HTTPS 域名");
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "OSS_ACCESS_DOMAIN 只能填写 HTTPS 域名，不能包含路径或参数",
        );
    }
    if (!/^oss-[a-z0-9-]+$/.test(env.OSS_REGION))
      throw new Error("OSS_REGION must look like oss-cn-hangzhou");
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.OSS_BUCKET))
      throw new Error("Invalid OSS_BUCKET");
    // 使用 OSS 服务端点，不填写带 Bucket 名称的地址或 CDN 域名。
    const endpoint = env.OSS_ENDPOINT?.trim() || undefined;
    if (endpoint) {
      let url;
      try {
        url = new URL(endpoint);
      } catch {
        throw new Error("OSS_ENDPOINT must be an HTTPS service endpoint");
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !/^oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)
      ) {
        throw new Error(
          "OSS_ENDPOINT must be an HTTPS OSS service endpoint without a bucket name",
        );
      }
    }
    return {
      provider,
      bucket: env.OSS_BUCKET,
      accessDomain: accessDomain ? new URL(accessDomain).origin : undefined,
      options: {
        region: env.OSS_REGION,
        bucket: env.OSS_BUCKET,
        endpoint,
        accessKeyId: env.OSS_ACCESS_KEY_ID,
        accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
        secure: true,
        authorizationV4: true,
        timeout: 60000,
      },
    };
  }
  return {
    provider,
    bucket: env.S3_BUCKET,
    options: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      requestHandler: { connectionTimeout: 10000, requestTimeout: 60000 },
    },
  };
}
