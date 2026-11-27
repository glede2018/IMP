type Clock = { now: () => number; wait: (ms: number) => Promise<void> };

export function oneApiRps() {
  const value = Number(process.env.ONEAPI_RPS ?? 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

// 所有平台、绑定预览、初始化、定时采集和请求重试共用进程内的请求队列。
export function createOneApiLimiter(
  clock: Clock = {
    now: () => performance.now(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  let nextAt = 0;
  let queue = Promise.resolve<unknown>(undefined);
  return () => {
    const queuedAt = clock.now();
    const slot = queue.then(async () => {
      while (clock.now() < nextAt) await clock.wait(nextAt - clock.now());
      const grantedAt = clock.now();
      const rps = oneApiRps();
      nextAt = grantedAt + Math.max(1, Math.ceil(1000 / rps));
      return { grantedAt, queueWaitMs: Math.round(grantedAt - queuedAt), rps };
    });
    queue = slot.catch(() => undefined);
    return slot;
  };
}
export const waitForOneApiSlot = createOneApiLimiter();
