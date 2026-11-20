import { ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { audit } from '../common/audit';
import { loadConfig } from '../config';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import * as s from '../db/schema';
import { isAllowedImageLicence } from '../editorial/licences';
import { RevalidationService } from '../editorial/revalidation.service';
import type { StaffPrincipal } from '../identity/session.service';
import { MediaMetadataDto, StaffMediaDto } from './dto';
import { ImageRejected, PIPELINE_MODIFICATION, pickVariant, processImage, sha256Hex } from './image-pipeline';
import { STORAGE, StorageAdapter, variantKey } from './storage';

type Asset = typeof s.mediaAssets.$inferSelect;

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function modificationsText(staffNote: string | null | undefined): string {
  const note = clean(staffNote);
  return note ? `${note.replace(/\.?$/, '.')} ${PIPELINE_MODIFICATION}` : PIPELINE_MODIFICATION;
}

/**
 * Media workflow (PLAN §6 media_assets, §7 media review, §9 uploads; DECISIONS D-022):
 * upload → pending → approved | rejected. Only admins review.
 * - Editing metadata sends an image back to pending. Revisions keep the credit and licence they snapshotted.
 * - Public serving: an image is served if it is approved, or if a currently published revision uses it
 *   (it was approved when that revision was published and its snapshot is what the page shows).
 *   A rejected image is never served and disappears from public pages at once: rejection is the takedown.
 */
@Injectable()
export class MediaService {
  private readonly maxBytes = loadConfig().MEDIA_MAX_BYTES;

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    private readonly revalidation: RevalidationService,
  ) {}

  /**
   * Validates, re-encodes and stores an image, then records it as pending.
   * The same bytes uploaded twice give the existing asset back (`created: false`): imports rely on this.
   */
  async ingest(
    actorId: string | null, input: Buffer, meta: MediaMetadataDto, db: DbOrTx = this.db, opts: { store?: boolean } = {},
  ): Promise<{ asset: Asset; created: boolean }> {
    if (!isAllowedImageLicence(meta.license)) {
      throw new UnprocessableEntityException({
        code: 'LICENCE_NOT_ALLOWED',
        message: 'This licence is not on the allow-list (CC0, PDM, CC BY, CC BY-SA). NC and ND images are not accepted.',
      });
    }
    const hash = sha256Hex(input);
    const [existing] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.sha256, hash));
    if (existing) return { asset: existing, created: false };

    let img;
    try {
      img = await processImage(input, this.maxBytes);
    } catch (e) {
      if (e instanceof ImageRejected) {
        if (e.code === 'TOO_LARGE') throw new PayloadTooLargeException({ code: 'MEDIA_TOO_LARGE', message: e.message });
        throw new UnprocessableEntityException({ code: `MEDIA_${e.code}`, message: e.message });
      }
      throw e;
    }
    // A dry run validates and re-encodes but writes no files (the row it inserts is rolled back by the caller).
    if (opts.store !== false) for (const v of img.variants) await this.storage.put(variantKey(img.sha256, v.width), v.bytes);
    const largest = img.variants[img.variants.length - 1];
    const [asset] = await db
      .insert(s.mediaAssets)
      .values({
        storageKey: img.sha256, sha256: img.sha256, mime: 'image/webp', width: largest.width, height: largest.height,
        bytes: largest.bytes.length, variants: img.variants.map((v) => v.width), creator: meta.creator.trim(), credit: meta.credit.trim(),
        license: meta.license.trim(), licenseUrl: clean(meta.licenseUrl), sourceUrl: clean(meta.sourceUrl),
        modifications: modificationsText(meta.modifications), uploadedBy: actorId,
      })
      .returning();
    await audit(db, { actorId, action: 'media.upload', entityType: 'media_asset', entityId: asset.id, summary: `Uploaded image (${asset.license})` });
    return { asset, created: true };
  }

  async upload(staff: StaffPrincipal, file: Buffer | undefined, meta: MediaMetadataDto): Promise<StaffMediaDto> {
    if (!file?.length) throw new UnprocessableEntityException({ code: 'MEDIA_MISSING', message: 'Attach an image in the "file" field' });
    const { asset, created } = await this.ingest(staff.id, file, meta);
    if (!created) throw new ConflictException({ code: 'DUPLICATE_MEDIA', message: 'This image was already uploaded', details: [asset.id] });
    return this.get(asset.id);
  }

  async list(state?: Asset['reviewState']): Promise<StaffMediaDto[]> {
    const rows = await this.db
      .select({ a: s.mediaAssets, used: sql<number>`(SELECT count(*)::int FROM revision_media rm WHERE rm.media_id = media_assets.id)` })
      .from(s.mediaAssets)
      .where(state ? eq(s.mediaAssets.reviewState, state) : undefined)
      .orderBy(desc(s.mediaAssets.createdAt))
      .limit(200);
    return rows.map((r) => toDto(r.a, r.used));
  }

  async get(id: string): Promise<StaffMediaDto> {
    const [r] = await this.db
      .select({ a: s.mediaAssets, used: sql<number>`(SELECT count(*)::int FROM revision_media rm WHERE rm.media_id = media_assets.id)` })
      .from(s.mediaAssets)
      .where(eq(s.mediaAssets.id, id));
    if (!r) throw new NotFoundException('Media not found');
    return toDto(r.a, r.used);
  }

  async updateMetadata(staff: StaffPrincipal, id: string, meta: MediaMetadataDto): Promise<StaffMediaDto> {
    if (!isAllowedImageLicence(meta.license)) {
      throw new UnprocessableEntityException({ code: 'LICENCE_NOT_ALLOWED', message: 'This licence is not on the allow-list (CC0, PDM, CC BY, CC BY-SA)' });
    }
    const slugs = await this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id)).for('update');
      if (!a) throw new NotFoundException('Media not found');
      await tx
        .update(s.mediaAssets)
        .set({
          creator: meta.creator.trim(), credit: meta.credit.trim(), license: meta.license.trim(), licenseUrl: clean(meta.licenseUrl),
          sourceUrl: clean(meta.sourceUrl), modifications: modificationsText(meta.modifications),
          reviewState: 'pending', reviewedBy: null, reviewedAt: null, reviewNote: null,
        })
        .where(eq(s.mediaAssets.id, id));
      await audit(tx, { actorId: staff.id, action: 'media.edit', entityType: 'media_asset', entityId: id, summary: 'Edited image metadata; back to pending review' });
      return this.publishedSlugsUsing(tx, id);
    });
    // Published pages keep their snapshots, but pending images are no longer offered to new drafts.
    if (slugs.length) await this.revalidation.revalidate([...slugs.map((x) => `species:${x}`), 'catalogue']);
    return this.get(id);
  }

  async review(staff: StaffPrincipal, id: string, decision: 'approved' | 'rejected', note?: string): Promise<StaffMediaDto> {
    const slugs = await this.db.transaction(async (tx) => {
      const [a] = await tx.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, id)).for('update');
      if (!a) throw new NotFoundException('Media not found');
      if (decision === 'approved' && !isAllowedImageLicence(a.license)) {
        throw new UnprocessableEntityException({ code: 'LICENCE_NOT_ALLOWED', message: 'An image can only be approved with an allow-listed licence' });
      }
      await tx
        .update(s.mediaAssets)
        .set({ reviewState: decision, reviewedBy: staff.id, reviewedAt: new Date(), reviewNote: clean(note) })
        .where(eq(s.mediaAssets.id, id));
      await audit(tx, {
        actorId: staff.id, action: decision === 'approved' ? 'media.approve' : 'media.reject', entityType: 'media_asset', entityId: id,
        summary: decision === 'approved' ? 'Approved image' : 'Rejected image (removed from public pages)',
      });
      return this.publishedSlugsUsing(tx, id);
    });
    if (slugs.length) await this.revalidation.revalidate([...slugs.map((x) => `species:${x}`), 'catalogue']);
    return this.get(id);
  }

  private async publishedSlugsUsing(db: DbOrTx, mediaId: string): Promise<string[]> {
    const rows = await db
      .select({ slug: s.species.slug })
      .from(s.revisionMedia)
      .innerJoin(s.species, eq(s.species.publishedRevisionId, s.revisionMedia.revisionId))
      .where(eq(s.revisionMedia.mediaId, mediaId));
    return [...new Set(rows.map((r) => r.slug))];
  }

  /** Public bytes for `<storageKey>/<width>.webp`, or null (→ 404) when the image must not be shown. */
  async publicVariant(storageKey: string, width: number): Promise<Buffer | null> {
    const [a] = await this.db
      .select({
        variants: s.mediaAssets.variants,
        reviewState: s.mediaAssets.reviewState,
        published: sql<boolean>`EXISTS (SELECT 1 FROM revision_media rm JOIN species sp ON sp.published_revision_id = rm.revision_id
                                         WHERE rm.media_id = media_assets.id AND sp.archived_at IS NULL)`,
      })
      .from(s.mediaAssets)
      .where(eq(s.mediaAssets.storageKey, storageKey));
    if (!a || a.reviewState === 'rejected') return null;
    if (a.reviewState !== 'approved' && !a.published) return null;
    const w = pickVariant(a.variants, width);
    return w ? this.storage.get(variantKey(storageKey, w)) : null;
  }

  /** Staff preview of any image, including pending and rejected ones (needed for review). */
  async staffPreview(id: string, width: number): Promise<Buffer | null> {
    const [a] = await this.db.select({ key: s.mediaAssets.storageKey, variants: s.mediaAssets.variants }).from(s.mediaAssets).where(and(eq(s.mediaAssets.id, id)));
    if (!a) return null;
    const w = pickVariant(a.variants, width);
    return w ? this.storage.get(variantKey(a.key, w)) : null;
  }
}

function toDto(a: Asset, used: number): StaffMediaDto {
  return {
    id: a.id, storageKey: a.storageKey, width: a.width, height: a.height, bytes: a.bytes, variants: a.variants, creator: a.creator,
    credit: a.credit, license: a.license, licenseAllowed: isAllowedImageLicence(a.license), licenseUrl: a.licenseUrl, sourceUrl: a.sourceUrl,
    modifications: a.modifications, reviewState: a.reviewState, reviewNote: a.reviewNote, reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(), usedByRevisions: used,
  };
}
