import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openDouyinAuthorization,
  completeDouyinAuthorization,
} from "../src/services/douyin-authorization.ts";

test("授权窗口完成后通知原页面；拦截、关闭和异常结果均不跳转原页面", () => {
  const keys = ["window", "sessionStorage", "BroadcastChannel"] as const;
  const originals = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  const channels: Channel[] = [];
  class Channel {
    onmessage?: (event: { data: unknown }) => void;
    closed = false;
    constructor(public name: string) {
      channels.push(this);
    }
    close() {
      this.closed = true;
    }
    postMessage(data: unknown) {
      for (const channel of channels) {
        if (channel !== this && channel.name === this.name && !channel.closed)
          channel.onmessage?.({ data });
      }
    }
  }
  let destination = "about:blank";
  let closed = false;
  const popup = {
    sessionStorage: storage,
    document: { title: "", body: { textContent: "" } },
    opener: {} as unknown,
    get closed() {
      return closed;
    },
    location: {
      replace: (url: string) => {
        destination = url;
      },
    },
    focus() {},
    close() {
      closed = true;
    },
  };
  const browser = {
    open: () => popup as typeof popup | null,
    setTimeout: () => 1,
    clearTimeout() {},
    close: () => popup.close(),
    location: { href: "http://localhost:8080/accounts" },
  };
  const results: string[] = [];
  try {
    for (const [key, value] of Object.entries({
      window: browser,
      sessionStorage: storage,
      BroadcastChannel: Channel,
    })) {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    }
    const authorization = openDouyinAuthorization((result) =>
      results.push(result),
    );
    assert.equal(destination, "about:blank");
    assert.equal(popup.opener, null);
    authorization.navigate("https://open.douyin.com/authorize");
    assert.equal(destination, "https://open.douyin.com/authorize");
    assert.equal(browser.location.href, "http://localhost:8080/accounts");
    assert.equal(completeDouyinAuthorization("unexpected"), false);
    assert.deepEqual(results, []);
    assert.equal(completeDouyinAuthorization("connected"), true);
    assert.deepEqual(results, ["connected"]);
    assert.equal(closed, true);
    assert(channels.every((channel) => channel.closed));
    assert.equal(completeDouyinAuthorization("connected"), false);
    assert.throws(
      () => authorization.navigate("https://open.douyin.com/authorize"),
      /已关闭/,
    );
    browser.open = () => null;
    assert.throws(() => openDouyinAuthorization(() => {}), /拦截/);
    assert.equal(browser.location.href, "http://localhost:8080/accounts");
  } finally {
    keys.forEach((key, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
