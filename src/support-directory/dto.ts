import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import * as s from '../db/schema';

type Enum<T extends { enumValues: readonly string[] }> = T['enumValues'][number];
const N = { nullable: true, type: String } as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HTTPS = { protocols: ['https'], require_protocol: true, require_tld: true };

// ---------- public: GET /support ----------

export class SupportSpeciesRefDto {
  @ApiProperty() slug!: string;
  @ApiProperty() scientificName!: string;
  @ApiProperty(N) commonName!: string | null;
}

export class DirectoryLinkDto {
  @ApiProperty() url!: string;
  @ApiProperty({ description: 'Destination domain, shown next to the link' }) domain!: string;
  @ApiProperty({ enum: s.supportActionType.enumValues }) actionType!: Enum<typeof s.supportActionType>;
  @ApiProperty() description!: string;
  @ApiProperty({ type: [SupportSpeciesRefDto], description: 'Published species whose profile shows this link' }) species!: SupportSpeciesRefDto[];
}

export class DirectoryOrganizationDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() website!: string;
  @ApiProperty() websiteDomain!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ ...N, description: 'When site staff last reviewed this organization. A review is not a certification of effectiveness.' })
  reviewedAt!: string | null;
  @ApiProperty({ type: [DirectoryLinkDto] }) links!: DirectoryLinkDto[];
}

/** Reviewed organizations and their reviewed action links. A click is a referral, never a donation (PLAN §10). */
export class SupportDirectoryDto {
  @ApiProperty({ type: [DirectoryOrganizationDto] }) organizations!: DirectoryOrganizationDto[];
}

// ---------- staff ----------

export class StaffSupportLinkDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ enum: s.supportActionType.enumValues }) actionType!: Enum<typeof s.supportActionType>;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: s.editorialStatus.enumValues }) editorialStatus!: Enum<typeof s.editorialStatus>;
  @ApiProperty(N) lastCheckedAt!: string | null;
  @ApiProperty({ nullable: true, type: Number }) lastStatus!: number | null;
}

export class StaffOrganizationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() website!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: s.editorialStatus.enumValues }) reviewStatus!: Enum<typeof s.editorialStatus>;
  @ApiProperty(N) reviewedAt!: string | null;
  @ApiProperty({ type: [StaffSupportLinkDto] }) links!: StaffSupportLinkDto[];
}

export class UpdateOrganizationDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @ApiProperty({ example: 'https://example.org' }) @IsUrl(HTTPS) @MaxLength(500) website!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(2000) description!: string;
}

export class CreateOrganizationDto extends UpdateOrganizationDto {
  @ApiProperty({ example: 'example-trust' }) @Matches(SLUG) @MaxLength(120) slug!: string;
}

export class UpdateSupportLinkDto {
  @ApiProperty({ example: 'https://example.org/act' }) @IsUrl(HTTPS) @MaxLength(1000) url!: string;
  @ApiProperty({ enum: s.supportActionType.enumValues }) @IsIn(s.supportActionType.enumValues) actionType!: Enum<typeof s.supportActionType>;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(1000) description!: string;
}

export class CreateSupportLinkDto extends UpdateSupportLinkDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() organizationId!: string;
}
