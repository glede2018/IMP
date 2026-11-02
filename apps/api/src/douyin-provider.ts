import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { tokenKey } from "./oauth-crypto.js";
export interface DouyinToken {
  accessToken: string;
  refreshToken: string;
  openId: string;
  scopes: string[];
  expiresIn: number;
  refreshExpiresIn: number;
}
export interface DouyinProfile {
  openId: string;
  nickname: string;
  avatar?: string;
}
export class DouyinApiError extends Error {
  constructor(public code: number) {
    super("抖音接口暂时不可用，请稍后重试。");
  }
  get invalidAuthorization() {
    return [
      10008, 10010, 2190002, 2190008, 28001003, 28001008, 28001012,
    ].includes(this.code);
  }
}
export function douyinConfig() {
  const clientKey = process.env.DOUYIN_CLIENT_KEY?.trim() || "";
  const clientSecret = process.env.DOUYIN_CLIENT_SECRET?.trim() || "";
  const redirectUri = process.env.DOUYIN_REDIRECT_URI?.trim() || "";
  const scopes = (process.env.DOUYIN_SCOPES || "user_info")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let reason = "";
  if (!clientKey || !clientSecret)
    reason = "尚未配置抖音网站应用，请先使用本地演示。";
  else {
    try {
      const uri = new URL(redirectUri);
      const origin = new URL(process.env.APP_ORIGIN!);
      if (
        uri.protocol !== "https:" ||
        uri.origin !== origin.origin ||
        uri.pathname !== "/api/v1/oauth/douyin/callback" ||
        uri.search ||
        uri.hash ||
        uri.username ||
        uri.password
      )
        throw new Error();
    } catch {
      reason = "抖音授权需要与网站同域的 HTTPS 回调地址。";
    }
    if (!scopes.includes("user_info"))
      reason = "抖音授权必须包含 user_info 权限。";
    try {
      tokenKey();
    } catch {
      reason = "尚未配置授权凭证加密密钥。";
    }
  }
  let local = false;
  try {
    local = ["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.APP_ORIGIN!).hostname,
    );
  } catch {}
  return {
    clientKey,
    clientSecret,
    redirectUri,
    scopes,
    ready: !reason,
    reason,
    demoAvailable: local && process.env.DOUYIN_DEMO_ENABLED === "true",
  };
}
@Injectable()
export class DouyinProvider {
  // Tests replace this method. Live URLs cannot be redirected to arbitrary hosts by configuration.
  async transport(
    path: string,
    body: Record<string, string>,
    json = false,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(`https://open.douyin.com${path}`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": json
            ? "application/json"
            : "application/x-www-form-urlencoded",
        },
        body: json ? JSON.stringify(body) : new URLSearchParams(body),
      });
    } catch {
      throw new DouyinApiError(-1);
    }
    if (!response.ok) throw new DouyinApiError(-1);
    let envelope: Record<string, any>;
    try {
      envelope = (await response.json()) as Record<string, any>;
    } catch {
      throw new DouyinApiError(-1);
    }
    for (const value of [
      envelope.error_code,
      envelope.data?.error_code,
      envelope.extra?.error_code,
    ]) {
      if (value !== undefined && Number(value) !== 0)
        throw new DouyinApiError(Number(value));
    }
    const data = envelope.data;
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new DouyinApiError(-1);
    return data;
  }
  ensureConfigured() {
    const config = douyinConfig();
    if (!config.ready) throw new ServiceUnavailableException(config.reason);
    return config;
  }
  authorizationUrl(state: string) {
    const config = this.ensureConfigured();
    const url = new URL("https://open.douyin.com/platform/oauth/connect/");
    url.search = new URLSearchParams({
      client_key: config.clientKey,
      response_type: "code",
      scope: config.scopes.join(","),
      redirect_uri: config.redirectUri,
      state,
    }).toString();
    return url.toString();
  }
  parseToken(
    data: Record<string, unknown>,
    previous?: { refreshToken: string; openId: string; scopes: string[] },
  ): DouyinToken {
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token ?? previous?.refreshToken;
    const openId = data.open_id ?? previous?.openId;
    const expiresIn = Number(data.expires_in);
    const refreshExpiresIn = Number(data.refresh_expires_in ?? 0);
    const scopes =
      typeof data.scope === "string"
        ? data.scope
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : previous?.scopes;
    if (
      typeof accessToken !== "string" ||
      !accessToken ||
      typeof refreshToken !== "string" ||
      !refreshToken ||
      typeof openId !== "string" ||
      !openId ||
      openId.length > 100 ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      expiresIn > 365 * 86400 ||
      !Number.isFinite(refreshExpiresIn) ||
      refreshExpiresIn < 0 ||
      refreshExpiresIn > 365 * 86400 ||
      !scopes?.includes("user_info")
    )
      throw new DouyinApiError(-1);
    if (previous && previous.openId !== openId) throw new DouyinApiError(-1);
    return {
      accessToken,
      refreshToken,
      openId,
      expiresIn,
      refreshExpiresIn,
      scopes,
    };
  }
  async exchange(code: string): Promise<DouyinToken> {
    const c = this.ensureConfigured();
    const token = this.parseToken(
      await this.transport("/oauth/access_token/", {
        client_key: c.clientKey,
        client_secret: c.clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    );
    if (!token.refreshExpiresIn) throw new DouyinApiError(-1);
    return token;
  }
  async refresh(
    refreshToken: string,
    openId: string,
    scopes: string[],
  ): Promise<DouyinToken> {
    const c = this.ensureConfigured();
    return this.parseToken(
      await this.transport("/oauth/refresh_token/", {
        client_key: c.clientKey,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      { refreshToken, openId, scopes },
    );
  }
  async profile(accessToken: string, openId: string): Promise<DouyinProfile> {
    const data = await this.transport(
      "/oauth/userinfo/",
      { access_token: accessToken, open_id: openId },
      true,
    );
    if (
      data.open_id !== openId ||
      typeof data.nickname !== "string" ||
      !data.nickname ||
      data.nickname.length > 100
    )
      throw new DouyinApiError(-1);
    let avatar: string | undefined;
    if (typeof data.avatar === "string") {
      try {
        const uri = new URL(data.avatar);
        if (uri.protocol === "https:" && !uri.username && !uri.password)
          avatar = uri.toString();
      } catch {}
    }
    return { openId, nickname: data.nickname, avatar };
  }
}
