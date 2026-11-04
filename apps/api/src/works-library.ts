import {
  Controller,
  Get,
  UseGuards,
  Req,
  Query,
  BadRequestException,
} from "@nestjs/common";
import {
  IsOptional,
  IsString,
  Length,
  IsIn,
  IsInt,
  Min,
  Max,
  IsISO8601,
} from "class-validator";
import { Type } from "class-transformer";
import { Prisma } from "@prisma/client";
import { Database } from "./database.js";
import { Storage } from "./storage.js";
import { AuthRequest, SessionGuard } from "./auth.js";
export class WorkLibraryQuery {
  @IsOptional() @IsString() @Length(0, 100) q?: string;
  @IsOptional() @IsString() @Length(1, 100) personId?: string;
  @IsOptional() @IsString() @Length(1, 100) productId?: string;
  @IsOptional() @IsString() @Length(1, 100) templateId?: string;
  @IsOptional()
  @IsIn(["awaiting_provider", "queued", "generating", "completed", "failed"])
  status?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
}
const sources = (org: string) => Prisma.sql`
 SELECT 'work' AS kind,w.id,w.title,w."createdAt",w."templateId",w."templateSnapshot",w."materialSnapshot",'completed' AS "taskStatus" FROM "Work" w WHERE w."organizationId"=${org}
 UNION ALL
 SELECT 'creation',d.id,d.title,d."createdAt",d."templateId",d."templateSnapshot",d."materialSnapshot",d.status FROM "VideoCreationDraft" d WHERE d."organizationId"=${org} AND NOT EXISTS (SELECT 1 FROM "Work" w WHERE w."creationId"=d.id AND w."organizationId"=${org})
`;
const materialsSql = Prisma.sql`jsonb_array_elements(CASE WHEN jsonb_typeof(l."materialSnapshot")='array' THEN l."materialSnapshot" ELSE '[]'::jsonb END)`;
export function materialSnapshot(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.flatMap((v) =>
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        typeof v.id === "string" &&
        typeof v.name === "string" &&
        ["person", "product"].includes(String(v.type))
          ? [{ id: v.id, name: v.name, type: String(v.type) }]
          : [],
      )
    : [];
}
interface LibraryRow {
  id: string;
  kind: string;
  title: string;
  createdAt: Date;
  taskStatus: string;
  caption: string;
  publishTags: string[];
  materials: ReturnType<typeof materialSnapshot>;
  templateId: string | null;
  templateName: string | null;
  generationSeconds: number | null;
  width: number | null;
  height: number | null;
  size: number | null;
  mimeType: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
}
@Controller("works")
@UseGuards(SessionGuard)
export class WorksLibraryController {
  constructor(
    private db: Database,
    private storage: Storage,
  ) {}
  @Get("library/options") async options(@Req() req: AuthRequest) {
    const org = req.user.organizationId;
    const materials = await this.db.$queryRaw<
      { id: string; name: string; type: string }[]
    >(
      Prisma.sql`WITH library AS (${sources(org)}) SELECT DISTINCT m->>'id' AS id,m->>'name' AS name,m->>'type' AS type FROM library l CROSS JOIN LATERAL ${materialsSql} m WHERE m->>'type' IN ('person','product') AND m->>'id' IS NOT NULL AND m->>'name' IS NOT NULL ORDER BY name,id`,
    );
    const templates = await this.db.$queryRaw<{ id: string; name: string }[]>(
      Prisma.sql`WITH library AS (${sources(org)}) SELECT DISTINCT l."templateId" AS id,COALESCE(l."templateSnapshot"->>'title',t.title,'历史模板') AS name FROM library l LEFT JOIN "Template" t ON t.id=l."templateId" AND t."organizationId"=${org} WHERE l."templateId" IS NOT NULL ORDER BY name,id`,
    );
    const unique = (rows: { id: string; name: string }[]) => [
      ...new Map(
        rows.map((r) => [r.id, { value: r.id, label: r.name }]),
      ).values(),
    ];
    return {
      persons: unique(materials.filter((m) => m.type === "person")),
      products: unique(materials.filter((m) => m.type === "product")),
      templates: unique(templates),
    };
  }
  @Get("library") async list(
    @Query() q: WorkLibraryQuery,
    @Req() req: AuthRequest,
  ) {
    if (q.from && q.to && new Date(q.from) >= new Date(q.to))
      throw new BadRequestException("结束时间必须晚于开始时间");
    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.q)
      conditions.push(
        Prisma.sql`strpos(lower(l.title), lower(${q.q.trim()})) > 0`,
      );
    if (q.templateId)
      conditions.push(Prisma.sql`l."templateId"=${q.templateId}`);
    if (q.status) conditions.push(Prisma.sql`l."taskStatus"=${q.status}`);
    if (q.from) conditions.push(Prisma.sql`l."createdAt">=${new Date(q.from)}`);
    if (q.to) conditions.push(Prisma.sql`l."createdAt"<${new Date(q.to)}`);
    for (const [type, id] of [
      ["person", q.personId],
      ["product", q.productId],
    ])
      if (id)
        conditions.push(
          Prisma.sql`EXISTS (SELECT 1 FROM ${materialsSql} m WHERE m->>'type'=${type} AND m->>'id'=${id})`,
        );
    const base = Prisma.sql`WITH library AS (${sources(req.user.organizationId)})`;
    const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
    const [keys, total] = await this.db.$transaction([
      this.db.$queryRaw<{ id: string; kind: string; taskStatus: string }[]>(
        Prisma.sql`${base} SELECT l.id,l.kind,l."taskStatus" FROM library l ${where} ORDER BY l."createdAt" DESC,l.kind,l.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      ),
      this.db.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`${base} SELECT COUNT(*) AS total FROM library l ${where}`,
      ),
    ]);
    const [works, drafts] = await Promise.all([
      this.db.work.findMany({
        where: {
          organizationId: req.user.organizationId,
          id: { in: keys.filter((k) => k.kind === "work").map((k) => k.id) },
        },
        include: { asset: true, template: { select: { title: true } } },
      }),
      this.db.videoCreationDraft.findMany({
        where: {
          organizationId: req.user.organizationId,
          id: {
            in: keys.filter((k) => k.kind === "creation").map((k) => k.id),
          },
        },
      }),
    ]);
    const workLinks = new Map(
      await Promise.all(
        works.map(
          async (w) => [w.id, await this.storage.links(w.asset)] as const,
        ),
      ),
    );
    const items = keys.flatMap<LibraryRow>((k) => {
      if (k.kind === "work") {
        const w = works.find((w) => w.id === k.id);
        if (!w) return [];
        return [
          {
            id: w.id,
            kind: "work",
            title: w.title,
            createdAt: w.createdAt,
            taskStatus: "completed",
            caption: w.caption,
            publishTags: w.publishTags,
            materials: materialSnapshot(w.materialSnapshot),
            templateId: w.templateId,
            templateName:
              w.templateSnapshot &&
              typeof w.templateSnapshot === "object" &&
              !Array.isArray(w.templateSnapshot) &&
              typeof w.templateSnapshot.title === "string"
                ? w.templateSnapshot.title
                : w.template?.title || null,
            generationSeconds: w.generationSeconds,
            width: w.width,
            height: w.height,
            size: w.asset.size,
            mimeType: w.asset.mimeType,
            previewUrl: workLinks.get(w.id)!.preview,
            downloadUrl: workLinks.get(w.id)!.downloadUrl,
          },
        ];
      }
      const d = drafts.find((d) => d.id === k.id);
      if (!d) return [];
      return [
        {
          id: d.id,
          kind: "creation",
          title: d.title,
          createdAt: d.createdAt,
          taskStatus: d.status,
          caption: "",
          publishTags: d.publishTags,
          materials: materialSnapshot(d.materialSnapshot),
          templateId: d.templateId,
          templateName:
            typeof d.templateSnapshot === "object" &&
            d.templateSnapshot &&
            !Array.isArray(d.templateSnapshot)
              ? String(d.templateSnapshot.title || "")
              : null,
          generationSeconds: null,
          width: null,
          height: null,
          size: null,
          mimeType: null,
          previewUrl: null,
          downloadUrl: null,
        },
      ];
    });
    return {
      items,
      total: Number(total[0].total),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
