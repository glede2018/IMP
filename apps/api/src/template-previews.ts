import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthRequest, SessionGuard } from "./auth.js";
import { CreatKeyClient } from "./creatkey-client.js";
import { Database } from "./database.js";
import { hasPermission, permissionsFor } from "./permissions.js";

@Controller("templates")
@UseGuards(SessionGuard)
export class TemplatePreviewsController {
  constructor(
    private db: Database,
    private client: CreatKeyClient,
  ) {}

  @Get(":id/preview") async preview(
    @Param("id") id: string,
    @Req() req: AuthRequest,
  ) {
    const template = await this.db.template.findFirst({
      where: {
        id,
        organizationId: req.user.organizationId,
        ...(hasPermission(permissionsFor(req.user), "templates:write")
          ? {}
          : { active: true }),
      },
      select: { config: true, sourceTemplateId: true },
    });
    if (!template) throw new NotFoundException("模板不存在或已下架");
    const config = template.config as Record<string, unknown> | null;
    // 预览按需查询，已有模板无需重新导入，也不改变模板执行快照。
    if (config?.source !== "creatkey-api" || !template.sourceTemplateId)
      return { url: null };
    const source = await this.client.template(
      req.user.organizationId,
      template.sourceTemplateId,
    );
    return { url: source.previewVideo?.url || null };
  }
}
