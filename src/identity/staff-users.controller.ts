import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { StaffPrincipal } from './session.service';
import { CurrentStaff, Roles, StaffGuard } from './staff.guard';
import { StaffLinkView, StaffUsersService, StaffUserView } from './staff-users.service';

const ROLES = ['editor', 'admin'] as const;

export class StaffUserDto implements StaffUserView {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ROLES }) role!: 'editor' | 'admin';
  @ApiProperty({ enum: ['active', 'invited', 'disabled'], description: 'invited: no password set yet' }) status!: 'active' | 'invited' | 'disabled';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) lastActiveAt!: string | null;
  @ApiProperty({ description: 'Sessions that are neither revoked nor past their absolute limit' }) openSessions!: number;
}

export class StaffLinkDto implements StaffLinkView {
  @ApiProperty({ enum: ['invite', 'reset'] }) purpose!: 'invite' | 'reset';
  @ApiProperty({ description: 'One-time link, shown only in this response. The token is in the fragment, so it never reaches a server log.' })
  url!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

class InviteResultDto {
  @ApiProperty({ type: StaffUserDto }) user!: StaffUserDto;
  @ApiProperty({ type: StaffLinkDto }) link!: StaffLinkDto;
}

class InviteStaffDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty({ enum: ROLES }) @IsIn(ROLES) role!: 'editor' | 'admin';
}

class UpdateStaffDto {
  @ApiPropertyOptional({ enum: ROLES }) @IsOptional() @IsIn(ROLES) role?: 'editor' | 'admin';
  @ApiPropertyOptional({ description: 'true ends every session, device and open link of the account at once' })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

const uuid = new ParseUUIDPipe({ version: undefined });

/** Staff management (PLAN §7, DECISIONS D-062). Admin only, including reading the list. */
@ApiTags('staff-users')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: false, description: 'Required on POST/PUT' })
@UseGuards(StaffGuard)
@Roles('admin')
@Controller('staff/users')
export class StaffUsersController {
  constructor(private readonly users: StaffUsersService) {}

  @Get()
  @ApiOkResponse({ type: [StaffUserDto] })
  list(): Promise<StaffUserDto[]> {
    return this.users.list();
  }

  /** Creates the account without a password and returns its invite link (valid 7 days), once. */
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: InviteResultDto })
  invite(@CurrentStaff() staff: StaffPrincipal, @Body() dto: InviteStaffDto): Promise<InviteResultDto> {
    return this.users.invite(staff, dto);
  }

  @Put(':id')
  @ApiOkResponse({ type: StaffUserDto })
  update(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: UpdateStaffDto): Promise<StaffUserDto> {
    return this.users.update(staff, id, dto);
  }

  /** A new invite link (no password yet, 7 days) or password reset link (24 hours). Earlier unused links stop working. */
  @Post(':id/link')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: StaffLinkDto })
  link(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffLinkDto> {
    return this.users.newLink(staff.id, id);
  }

  @Post(':id/sign-out')
  @HttpCode(200)
  @ApiOkResponse({ type: StaffUserDto })
  signOut(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffUserDto> {
    return this.users.signOutEverywhere(staff, id);
  }
}
