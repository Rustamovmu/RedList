import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { StaffPrincipal } from '../identity/session.service';
import { CurrentStaff, Roles, StaffGuard } from '../identity/staff.guard';
import {
  AddIdentifierDto, CreateSourceDto, CreateSpeciesDto, ReferenceListsDto, RequestChangesDto, RevisionDetailDto, RollbackDto, SaveDraftDto,
  SourceDto, SourceUpdateResultDto, StaffSpeciesDto, UpdateSourceDto,
} from './dto';
import { EditorialService } from './editorial.service';

const uuid = new ParseUUIDPipe({ version: undefined });

/**
 * Staff editorial API. Every route requires a session; every mutation also requires Origin + CSRF (StaffGuard).
 * Editors create, edit and submit. Only admins publish and request changes.
 */
@ApiTags('staff-editorial')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: false, description: 'Required on POST/PUT/DELETE' })
@UseGuards(StaffGuard)
@Controller('staff')
export class EditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Get('species')
  @ApiOkResponse({ type: [StaffSpeciesDto] })
  listSpecies(): Promise<StaffSpeciesDto[]> {
    return this.editorial.listSpecies();
  }

  @Post('species')
  @ApiCreatedResponse({ type: RevisionDetailDto, description: 'The new species with its first draft (v1)' })
  createSpecies(@CurrentStaff() staff: StaffPrincipal, @Body() dto: CreateSpeciesDto): Promise<RevisionDetailDto> {
    return this.editorial.createSpecies(staff, dto);
  }

  @Get('species/:id')
  @ApiOkResponse({ type: StaffSpeciesDto })
  getSpecies(@Param('id', uuid) id: string): Promise<StaffSpeciesDto> {
    return this.editorial.getSpecies(id);
  }

  @Post('species/:id/identifiers')
  @ApiCreatedResponse({ type: StaffSpeciesDto })
  addIdentifier(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: AddIdentifierDto): Promise<StaffSpeciesDto> {
    return this.editorial.addIdentifier(staff, id, dto);
  }

  @Post('species/:id/drafts')
  @ApiCreatedResponse({ type: RevisionDetailDto, description: 'A new draft copied from the published revision' })
  createDraft(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<RevisionDetailDto> {
    return this.editorial.createDraft(staff, id);
  }

  @Post('species/:id/rollback')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffSpeciesDto, description: 'The species with its published pointer moved to the restored revision' })
  rollback(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: RollbackDto): Promise<StaffSpeciesDto> {
    return this.editorial.rollback(staff, id, dto);
  }

  @Get('revisions/:id')
  @ApiOkResponse({ type: RevisionDetailDto })
  getRevision(@Param('id', uuid) id: string): Promise<RevisionDetailDto> {
    return this.editorial.getRevision(id);
  }

  @Put('revisions/:id')
  @ApiOkResponse({ type: RevisionDetailDto })
  saveDraft(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: SaveDraftDto): Promise<RevisionDetailDto> {
    return this.editorial.saveDraft(staff, id, dto);
  }

  @Post('revisions/:id/submit')
  @HttpCode(200)
  @ApiOkResponse({ type: RevisionDetailDto })
  submit(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<RevisionDetailDto> {
    return this.editorial.submit(staff, id);
  }

  @Post('revisions/:id/publish')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: RevisionDetailDto })
  publish(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<RevisionDetailDto> {
    return this.editorial.publish(staff, id);
  }

  @Post('revisions/:id/request-changes')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: RevisionDetailDto })
  requestChanges(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: RequestChangesDto): Promise<RevisionDetailDto> {
    return this.editorial.requestChanges(staff, id, dto.notes);
  }

  @Get('sources')
  @ApiQuery({ name: 'q', required: false })
  @ApiOkResponse({ type: [SourceDto] })
  listSources(@Query('q') q?: string): Promise<SourceDto[]> {
    return this.editorial.listSources(typeof q === 'string' ? q.slice(0, 100) : undefined);
  }

  @Post('sources')
  @ApiCreatedResponse({ type: SourceDto })
  createSource(@CurrentStaff() staff: StaffPrincipal, @Body() dto: CreateSourceDto): Promise<SourceDto> {
    return this.editorial.createSource(staff, dto);
  }

  @Put('sources/:id')
  @ApiOkResponse({ type: SourceUpdateResultDto, description: 'A source cited by a submitted or published revision is never changed: a new row is created instead' })
  updateSource(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: UpdateSourceDto): Promise<SourceUpdateResultDto> {
    return this.editorial.updateSource(staff, id, dto);
  }

  @Get('reference')
  @ApiOkResponse({ type: ReferenceListsDto, description: 'Pick lists for the editor: regions, habitats, threats, media, support links' })
  reference(): Promise<ReferenceListsDto> {
    return this.editorial.referenceLists();
  }
}
