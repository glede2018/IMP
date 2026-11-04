const reloadKey = "imp-version-reload-at";

// 发布后旧页面可能引用已删除的分包；自动刷新一次，并限制频率避免循环刷新。
export function recoverVersion(
  storage: Pick<Storage, "getItem" | "setItem">,
  reload: () => void,
  now = Date.now(),
) {
  try {
    const previous = storage.getItem(reloadKey);
    if (previous !== null && now - Number(previous) < 60000) return false;
    storage.setItem(reloadKey, String(now));
  } catch {
    // 无法保存刷新标记时由错误页面提供手动刷新，避免无限重载。
    return false;
  }
  reload();
  return true;
}

export function installVersionRecovery() {
  window.addEventListener("vite:preloadError", (event) => {
    // 只处理分包加载失败，不干扰业务接口错误。
    try {
      recoverVersion(window.sessionStorage, () => {
        event.preventDefault();
        window.location.reload();
      });
    } catch {
      // 隐私模式禁用会话存储时，保留错误页面供用户手动刷新。
    }
  });
}
