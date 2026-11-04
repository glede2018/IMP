BEGIN;

-- 锁定会话表，避免旧服务并发登录干扰去重和唯一索引创建。
LOCK TABLE "Session" IN ACCESS EXCLUSIVE MODE;

-- 每个账号只保留最新有效会话，关联授权状态由外键级联清理。
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "userId"
    ORDER BY ("expiresAt" > CURRENT_TIMESTAMP) DESC, "createdAt" DESC, id DESC
  ) AS position
  FROM "Session"
)
DELETE FROM "Session" WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "Session_userId_key" ON "Session"("userId");

COMMIT;
