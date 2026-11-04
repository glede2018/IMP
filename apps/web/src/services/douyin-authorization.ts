const popupKey = "imp-douyin-authorization-popup";
export const douyinAuthorizationMessages: Record<string, string> = {
  connected: "抖音授权成功",
  demo: "本地演示授权已完成（非真实抖音授权）",
  cancelled: "已取消授权",
  conflict: "该账号已绑定，或与原授权账号不同",
  invalid: "授权请求已过期或不匹配，请重新发起",
  failed: "抖音授权未完成，请重试并检查应用配置",
  forbidden: "当前账号没有绑定权限",
};

export function openDouyinAuthorization(onResult: (result: string) => void) {
  // 在点击事件内先打开窗口，避免等待接口后被浏览器拦截。
  const id = crypto.randomUUID();
  const popup = window.open(
    "about:blank",
    `imp-douyin-${id}`,
    "popup=yes,width=720,height=800,resizable=yes,scrollbars=yes",
  );
  if (!popup)
    throw new Error("授权窗口被浏览器拦截，请允许本站打开弹出窗口后重试");
  let channel: BroadcastChannel;
  try {
    popup.sessionStorage.setItem(popupKey, id);
    popup.document.title = "正在打开抖音授权";
    popup.document.body.textContent = "正在打开抖音授权，请稍候…";
    // 第三方授权页面不需要访问原窗口，结果通过同源通道通知。
    popup.opener = null;
    channel = new BroadcastChannel(`imp-douyin-${id}`);
  } catch (e) {
    popup.close();
    throw e;
  }
  const dispose = () => {
    window.clearTimeout(timeout);
    channel.close();
  };
  const timeout = window.setTimeout(dispose, 10 * 60 * 1000);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (
      typeof event.data !== "string" ||
      !Object.hasOwn(douyinAuthorizationMessages, event.data)
    )
      return;
    dispose();
    onResult(event.data);
  };
  return {
    navigate(url: string) {
      if (popup.closed) throw new Error("授权窗口已关闭，请重新发起授权");
      popup.location.replace(url);
      popup.focus();
    },
    close() {
      dispose();
      popup.close();
    },
    dispose,
  };
}

export function completeDouyinAuthorization(result: string) {
  if (!Object.hasOwn(douyinAuthorizationMessages, result)) return false;
  const id = sessionStorage.getItem(popupKey);
  if (!id) return false;
  sessionStorage.removeItem(popupKey);
  const channel = new BroadcastChannel(`imp-douyin-${id}`);
  channel.postMessage(result);
  channel.close();
  window.close();
  return true;
}
