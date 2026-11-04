import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  Length,
  Matches,
  IsIn,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsObject,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import type { WorkStatus } from "@prisma/client";
export class LoginDto {
  @IsOptional() @IsString() @Length(1, 100) account?: string;
  @IsOptional()
  @Matches(/^1[3-9]\d{9}$/)
  @ApiPropertyOptional({ type: String })
  phone?: string;
  @IsString() @Length(1, 128) @ApiProperty({ type: String }) password!: string;
}
export class PageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  page = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  pageSize = 20;
  @IsOptional()
  @IsString()
  @Length(0, 100)
  @ApiPropertyOptional({ type: String })
  q?: string;
  @IsOptional()
  @IsIn([
    "product",
    "copy",
    "image",
    "portrait",
    "voice",
    "course",
    "doc",
    "contact",
  ])
  @ApiPropertyOptional({ type: String })
  type?: string;
  @IsOptional()
  @IsIn(["new_product", "festival", "ingredient", "store"])
  @ApiPropertyOptional({ type: String })
  category?: string;
  @IsOptional()
  @IsIn(["draft", "review", "approved", "rejected"])
  @ApiPropertyOptional({ type: String })
  status?: string;
  @IsOptional()
  @IsIn(["douyin", "xiaohongshu", "kuaishou", "shipinhao"])
  @ApiPropertyOptional({ type: String })
  platform?: string;
  @IsOptional()
  @IsIn(["brand", "personal_ip", "store_ip"])
  @ApiPropertyOptional({ type: String })
  tier?: string;
}
export class AccountDto {
  @IsString() @Length(1, 100) @ApiProperty({ type: String }) nickname!: string;
  @IsString() @Length(1, 100) @ApiProperty({ type: String }) accountId!: string;
  @IsIn(["douyin", "xiaohongshu", "kuaishou", "shipinhao"])
  @ApiProperty({ type: String })
  platform!: string;
  @IsIn(["brand", "personal_ip", "store_ip"])
  @ApiProperty({ type: String })
  tier!: string;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @ApiPropertyOptional({ type: String })
  storeId?: string;
}
export class AssetDto {
  @IsOptional()
  @IsIn(["template"])
  @ApiPropertyOptional({ type: String, enum: ["template"] })
  purpose?: "template";
  @IsString() @Length(1, 200) @ApiProperty({ type: String }) name!: string;
  @IsIn(["product", "copy", "image", "portrait", "voice"])
  @ApiProperty({ type: String })
  type!: string;
  @IsOptional()
  @IsString()
  @Length(0, 500)
  @ApiPropertyOptional({ type: String })
  tags?: string;
}
export class TemplateDto {
  @IsString() @Length(1, 200) @ApiProperty({ type: String }) title!: string;
  @IsString()
  @Length(1, 2000)
  @ApiProperty({ type: String })
  description!: string;
  @IsIn(["new_product", "festival", "ingredient", "store"])
  @ApiProperty({ type: String })
  category!: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  @ApiProperty({ type: [String] })
  tags!: string[];
  @IsObject() @ApiProperty({ type: Object }) config!: Record<string, unknown>;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @ApiPropertyOptional({ type: String })
  coverAssetId?: string;
}
export class WorkDto {
  @IsOptional() @IsString() @Length(1, 100) creationId?: string;
  @IsOptional() @IsString() @Length(0, 2000) caption?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 101, { each: true })
  publishTags?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(16384) width?: number;
  @IsOptional() @IsInt() @Min(1) @Max(16384) height?: number;
  @IsOptional() @IsInt() @Min(0) @Max(86400) generationSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  materialIds?: string[];
  @IsString() @Length(1, 200) @ApiProperty({ type: String }) title!: string;
  @IsString() @Length(1, 100) @ApiProperty({ type: String }) assetId!: string;
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @ApiPropertyOptional({ type: String })
  templateId?: string;
}
export class WorkUpdateDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @ApiPropertyOptional({ type: String })
  title?: string;
  @IsOptional()
  @IsIn(["draft", "review", "approved", "rejected"])
  @ApiPropertyOptional({ type: String })
  status?: WorkStatus;
}
export class StoreDto {
  @IsString() @Length(1, 100) @ApiProperty({ type: String }) name!: string;
}
export class PasswordDto {
  @IsString()
  @Length(1, 128)
  @ApiProperty({ type: String })
  currentPassword!: string;
  @IsString()
  @Length(12, 128)
  @ApiProperty({ type: String })
  newPassword!: string;
}
export class HelpDto {
  @IsString() @Length(1, 200) @ApiProperty({ type: String }) title!: string;
  @IsIn(["course", "doc", "contact"])
  @ApiProperty({ type: String })
  type!: string;
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  @ApiPropertyOptional({ type: String })
  description?: string;
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  @ApiPropertyOptional({ type: String })
  url?: string;
}
