import type { UploadFile } from "antd";
export const uploadHeaders = { "X-IMP-Request": "1" };
export function uploadErrorMessage(
  file: UploadFile<unknown>,
  fallback = "上传失败，请重试",
) {
  if ((file.error as { status?: number } | undefined)?.status === 401) {
    window.dispatchEvent(new Event("imp-session-expired"));
  }
  const response = file.response;
  if (response && typeof response === "object" && "message" in response) {
    const message = response.message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && message.every((m) => typeof m === "string"))
      return message.join("；");
  }
  return fallback;
}
