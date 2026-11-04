import { appOrigins } from "./app-origins.js";
import {
  WorkflowEngine,
  WorkflowProvider,
  WorkflowRunsController,
} from "./workflow-engine.js";
import "reflect-metadata";
import { WorksLibraryController } from "./works-library.js";
import { TagsController } from "./tags.js";
import { TemplateCreationsController } from "./template-creations.js";
import {
  DouyinAnalyticsController,
  DouyinAnalyticsService,
} from "./douyin-analytics.js";
import { DouyinDataProvider } from "./douyin-data-provider.js";
import { MaterialCategoriesController } from "./material-categories.js";
import { MaterialsController } from "./materials.js";
import { AccessController } from "./access.js";
import {
  Module,
  ValidationPipe,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  Logger,
  Controller,
  Get,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type NestExpressApplication,
  ExpressAdapter,
} from "@nestjs/platform-express";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { Prisma } from "@prisma/client";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { DouyinController, DouyinService } from "./douyin.js";
import { DouyinProvider } from "./douyin-provider.js";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { storageConfig } from "../storage-config.mjs";
import { trustedProxyRanges } from "./proxy-config.js";
import { AuthController, SessionGuard } from "./auth.js";
import {
  AccountsController,
  AssetsController,
  TemplatesController,
  WorksController,
  OrganizationController,
  HelpController,
  AnalyticsController,
  Operations,
} from "./resources.js";
@Controller("health")
class HealthController {
  constructor(private db: Database) {}
  @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500;
    let message: unknown = "服务器暂时不可用";
    if (error instanceof HttpException) {
      status = error.getStatus();
      const response = error.getResponse();
      message =
        typeof response === "string" ? response : (response as any).message;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        status = 409;
        message = "记录已存在，请检查重复信息";
      } else if (error.code === "P2025") {
        status = 404;
        message = "记录不存在或已被修改";
      } else if (error.code === "P2003") {
        status = 409;
        message = "记录仍被引用，无法删除";
      } else if (error.code === "P2034") {
        status = 409;
        message = "数据已被其他操作修改，请重试";
      }
    }
    if (error instanceof Error && error.name === "InvalidRange") {
      status = 416;
      message = "文件范围无效";
    }
    if (error instanceof Error && error.name === "NoSuchKey") {
      status = 404;
      message = "文件不存在";
    }
    if (status === 500)
      new Logger("API").error(
        error instanceof Error ? error.stack : String(error),
      );
    res.status(status).json({
      statusCode: status,
      message,
      code: status === 500 ? "INTERNAL_ERROR" : `HTTP_${status}`,
    });
  }
}
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
  controllers: [
    WorksLibraryController,
    TemplateCreationsController,
    TagsController,
    MaterialCategoriesController,
    MaterialsController,
    WorkflowRunsController,
    AccessController,
    HealthController,
    DouyinController,
    AuthController,
    AccountsController,
    AssetsController,
    TemplatesController,
    WorksController,
    OrganizationController,
    HelpController,
    AnalyticsController,
    DouyinAnalyticsController,
  ],
  providers: [
    WorkflowEngine,
    WorkflowProvider,
    Database,
    DouyinProvider,
    DouyinService,
    DouyinDataProvider,
    DouyinAnalyticsService,
    Storage,
    SessionGuard,
    Operations,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
class AppModule {}
export async function createApp() {
  for (const key of ["DATABASE_URL", "APP_ORIGIN"])
    if (!process.env[key])
      throw new Error(`Missing environment variable: ${key}`);
  storageConfig();
  const proxies = trustedProxyRanges();
  const origins = appOrigins();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(),
    { bodyParser: false },
  );
  app.useBodyParser("json", { limit: "1mb" });
  app.getHttpAdapter().getInstance().set("trust proxy", proxies);
  app.setGlobalPrefix("api/v1");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "same-origin" },
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ErrorFilter());
  if (process.env.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("IMP API")
        .setVersion("1.0")
        .addCookieAuth("imp_session")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }
  app.enableShutdownHooks();
  return app;
}
