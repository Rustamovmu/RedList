import {
  Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { loadConfig } from '../config';
import type { StaffPrincipal } from '../identity/session.service';
import { CurrentStaff, Roles, StaffGuard } from '../identity/staff.guard';
import { MediaMetadataDto, MediaQueryDto, MediaUploadDto, RejectMediaDto, StaffMediaDto } from './dto';
import { MediaService } from './media.service';

const uuid = new ParseUUIDPipe({ version: undefined });
const KEY = /^[a-f0-9]{64}$/;
const FILE = /^(\d{2,4})\.webp$/;

function image(res: Response, bytes: Buffer, cache: string): StreamableFile {
  res.setHeader('Cache-Control', cache);
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  return new StreamableFile(bytes, { type: 'image/webp', length: bytes.length });
}

/**
 * Public image variants. Same-origin through the web app's /api/v1 rewrite, so pages never load images
 * from a third party (PLAN §8). Cached for a day, not forever, so a rejection (takedown) also expires
 * from browser caches (DECISIONS D-022).
 */
@ApiTags('media')
@Controller('media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':key/:file')
  @ApiParam({ name: 'key', description: 'storageKey from a profile or card' })
  @ApiParam({ name: 'file', description: '<width>.webp; the nearest generated width at least as wide is served' })
  @ApiProduces('image/webp')
  @ApiOkResponse({ description: 'WebP image' })
  async variant(@Param('key') key: string, @Param('file') file: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const m = FILE.exec(file);
    if (!KEY.test(key) || !m) throw new NotFoundException('Image not found');
    const bytes = await this.media.publicVariant(key, Number(m[1]));
    if (!bytes) throw new NotFoundException('Image not found');
    return image(res, bytes, 'public, max-age=86400');
  }
}

/** Staff media: any staff member uploads and edits; only admins approve or reject (PLAN §7). */
@ApiTags('staff-media')
@ApiCookieAuth()
@ApiHeader({ name: 'x-csrf-token', required: false, description: 'Required on POST/PUT' })
@UseGuards(StaffGuard)
@Controller('staff/media')
export class StaffMediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @ApiOkResponse({ type: [StaffMediaDto], description: 'Newest first; filter by review state for the queue' })
  list(@Query() q: MediaQueryDto): Promise<StaffMediaDto[]> {
    return this.media.list(q.state);
  }

  // The guard runs before the interceptor, so an unauthenticated or CSRF-less upload is refused before any bytes are buffered.
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: loadConfig().MEDIA_MAX_BYTES, files: 1, fields: 10, fieldSize: 4000 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: MediaUploadDto })
  @ApiCreatedResponse({ type: StaffMediaDto, description: 'Stored as pending review' })
  upload(@CurrentStaff() staff: StaffPrincipal, @UploadedFile() file: Express.Multer.File | undefined, @Body() meta: MediaMetadataDto): Promise<StaffMediaDto> {
    return this.media.upload(staff, file?.buffer, meta);
  }

  @Get(':id')
  @ApiOkResponse({ type: StaffMediaDto })
  get(@Param('id', uuid) id: string): Promise<StaffMediaDto> {
    return this.media.get(id);
  }

  @Get(':id/preview/:file')
  @ApiProduces('image/webp')
  @ApiOkResponse({ description: 'WebP preview of any image, for review' })
  async preview(@Param('id', uuid) id: string, @Param('file') file: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const m = FILE.exec(file);
    if (!m) throw new NotFoundException('Image not found');
    const bytes = await this.media.staffPreview(id, Number(m[1]));
    if (!bytes) throw new NotFoundException('Image not found');
    return image(res, bytes, 'private, no-store');
  }

  @Put(':id')
  @ApiOkResponse({ type: StaffMediaDto, description: 'Edits send the image back to pending review. Published revisions keep their snapshots.' })
  update(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() meta: MediaMetadataDto): Promise<StaffMediaDto> {
    return this.media.updateMetadata(staff, id, meta);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffMediaDto })
  approve(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string): Promise<StaffMediaDto> {
    return this.media.review(staff, id, 'approved');
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('admin')
  @ApiOkResponse({ type: StaffMediaDto, description: 'A rejected image disappears from public pages at once' })
  reject(@CurrentStaff() staff: StaffPrincipal, @Param('id', uuid) id: string, @Body() dto: RejectMediaDto): Promise<StaffMediaDto> {
    return this.media.review(staff, id, 'rejected', dto.note);
  }
}
