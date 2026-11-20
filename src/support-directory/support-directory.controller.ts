import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { StaffPrincipal } from '../identity/session.service';
import { CurrentStaff, Roles, StaffGuard } from '../identity/staff.guard';
import {
  CreateOrganizationDto, CreateSupportLinkDto, StaffOrganizationDto, StaffSupportLinkDto, SupportDirectoryDto, UpdateOrganizationDto,
  UpdateSupportLinkDto,
} from './dto';
import { SupportDirectoryService } from './support-directory.service';

const uuid = new ParseUUIDPipe({ version: undefined });

/** Public: reviewed organizations and their reviewed action links. */
@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(private readonly directory: SupportDirectoryService) {}

  @Get()
  @ApiOkResponse({ type: SupportDirectoryDto })
  list(): Promise<SupportDirectoryDto> {
    return this.directory.directory();
  }
}

/** Staff: managing the support directory is an admin task (PLAN §7). Every staff member may read it. */
@ApiTags('staff-support')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: false, description: 'Required on POST/PUT' })
@UseGuards(StaffGuard)
@Controller('staff')
export class StaffSupportController {
  constructor(private readonly directory: SupportDirectoryService) {}

  @Get('organizations')
  @ApiOkResponse({ type: [StaffOrganizationDto] })
  organizations(): Promise<StaffOrganizationDto[]> {
    return this.directory.listOrganizations();
  }

  @Post('organizations')
  @Roles('admin')
  @ApiCreatedResponse({ type: StaffOrganizationDto })
  createOrganization(@CurrentStaff() staff: StaffPrincipal, @Body() dto: CreateOrganizationDto): Promise<StaffOrganizationDto> {
    return this.directory.createOrganization(staff, dto);
  }

  @Put('organizations/:id')
  @Roles('admin')
  @ApiOkResponse({ type: StaffOrganizationDto, description: 'Edits send the organization back to pending review' })
  updateOrganization(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: UpdateOrganizationDto): Promise<StaffOrganizationDto> {
    return this.directory.updateOrganization(staff, id, dto);
  }

  @Post('organizations/:id/approve')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffOrganizationDto })
  approveOrganization(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffOrganizationDto> {
    return this.directory.setOrganizationStatus(staff, id, 'approved');
  }

  @Post('organizations/:id/disable')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffOrganizationDto, description: 'Hides the organization and all its links at once' })
  disableOrganization(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffOrganizationDto> {
    return this.directory.setOrganizationStatus(staff, id, 'disabled');
  }

  @Post('support-links')
  @Roles('admin')
  @ApiCreatedResponse({ type: StaffSupportLinkDto })
  createLink(@CurrentStaff() staff: StaffPrincipal, @Body() dto: CreateSupportLinkDto): Promise<StaffSupportLinkDto> {
    return this.directory.createLink(staff, dto);
  }

  @Put('support-links/:id')
  @Roles('admin')
  @ApiOkResponse({ type: StaffSupportLinkDto, description: 'Edits send the link back to pending review' })
  updateLink(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: UpdateSupportLinkDto): Promise<StaffSupportLinkDto> {
    return this.directory.updateLink(staff, id, dto);
  }

  @Post('support-links/:id/approve')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffSupportLinkDto })
  approveLink(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffSupportLinkDto> {
    return this.directory.setLinkStatus(staff, id, 'approved');
  }

  @Post('support-links/:id/disable')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffSupportLinkDto, description: 'Hides the link everywhere at once; audited; no new species revision' })
  disableLink(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffSupportLinkDto> {
    return this.directory.setLinkStatus(staff, id, 'disabled');
  }
}
