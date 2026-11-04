import { test } from "node:test";
import assert from "node:assert/strict";
import { request, advanceSessionGeneration } from "../src/services/api.ts";

test("当前会话失效时通知页面，旧请求和登录失败不会退出新登录", async (t) => {
  const target = new EventTarget();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: target,
    configurable: true,
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const messages: string[] = [];
  target.addEventListener("imp-session-expired", (event) => {
    messages.push((event as CustomEvent<string>).detail);
  });
  const unauthorized = () =>
    new Response(JSON.stringify({ message: "账号已在其他设备登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  t.mock.method(globalThis, "fetch", async () => unauthorized());
  await assert.rejects(request("/auth/me"), /其他设备/);
  assert.deepEqual(messages, ["账号已在其他设备登录"]);
  await assert.rejects(request("/auth/login", { method: "POST" }), /其他设备/);
  assert.equal(messages.length, 1);
  let finish!: (response: Response) => void;
  t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const previous = request("/works");
  // 用户已经完成新的登录，旧请求此时才返回 401。
  advanceSessionGeneration();
  finish(unauthorized());
  await assert.rejects(previous, /其他设备/);
  assert.equal(messages.length, 1);
});
