import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import * as s from '../db/schema';

const N = { nullable: true, type: String } as const;
const https = { protocols: ['https'], require_protocol: true };

/** Text fields sent with a multipart upload, and the body of a metadata edit. */
export class MediaMetadataDto {
  @ApiProperty({ description: 'Who made the image, as the source names them' }) @IsString() @MinLength(1) @MaxLength(200) creator!: string;
  @ApiProperty({ description: 'The credit line shown under the image, e.g. "Photo: Jane Doe, CC BY 4.0, via Wikimedia Commons"' })
  @IsString() @MinLength(3) @MaxLength(300) credit!: string;
  @ApiProperty({ description: 'Licence. Must be on the allow-list: CC0, PDM, CC BY, CC BY-SA (any version)' }) @IsString() @MinLength(2) @MaxLength(40) license!: string;
  @ApiPropertyOptional(N) @IsOptional() @IsUrl(https) @MaxLength(1000) licenseUrl?: string | null;
  @ApiPropertyOptional({ ...N, description: 'The page the image came from (https)' }) @IsOptional() @IsUrl(https) @MaxLength(1000) sourceUrl?: string | null;
  @ApiPropertyOptional({ ...N, description: 'Changes made before upload (cropping, colour). Resizing and re-encoding are added automatically.' })
  @IsOptional() @IsString() @MaxLength(500) modifications?: string | null;
}

/** Swagger-only description of the multipart body. */
export class MediaUploadDto extends MediaMetadataDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'JPEG, PNG or WebP. SVG and anything else is refused.' }) file!: unknown;
}

export class RejectMediaDto {
  @ApiProperty({ description: 'Why the image was rejected (shown to staff only)' }) @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}

export class MediaQueryDto {
  @ApiPropertyOptional({ enum: s.mediaReviewState.enumValues }) @IsOptional() @IsIn(s.mediaReviewState.enumValues) state?: (typeof s.mediaReviewState.enumValues)[number];
}

export class StaffMediaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Public images are served at /api/v1/media/<storageKey>/<width>.webp once approved' }) storageKey!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiProperty() bytes!: number;
  @ApiProperty({ type: [Number] }) variants!: number[];
  @ApiProperty() creator!: string;
  @ApiProperty() credit!: string;
  @ApiProperty() license!: string;
  @ApiProperty({ description: 'Whether the licence is on the allow-list' }) licenseAllowed!: boolean;
  @ApiProperty(N) licenseUrl!: string | null;
  @ApiProperty(N) sourceUrl!: string | null;
  @ApiProperty(N) modifications!: string | null;
  @ApiProperty({ enum: s.mediaReviewState.enumValues }) reviewState!: (typeof s.mediaReviewState.enumValues)[number];
  @ApiProperty(N) reviewNote!: string | null;
  @ApiProperty(N) reviewedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ description: 'How many revisions use this image (any state)' }) usedByRevisions!: number;
}
