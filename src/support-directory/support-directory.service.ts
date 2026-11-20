import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { COMMON_NAME, PUBLISHED } from '../catalogue/catalogue-sql';
import { audit } from '../common/audit';
import { domainOf } from '../common/url';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import * as s from '../db/schema';
import { RevalidationService } from '../editorial/revalidation.service';
import type { StaffPrincipal } from '../identity/session.service';
import {
  CreateOrganizationDto, CreateSupportLinkDto, StaffOrganizationDto, StaffSupportLinkDto, SupportDirectoryDto, UpdateOrganizationDto,
  UpdateSupportLinkDto,
} from './dto';

type Status = 'pending' | 'approved' | 'disabled';
const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Support directory (PLAN §6, §10). Rules (DECISIONS D-018):
 * - New organizations and links start as pending. Only approved organizations' approved links are public.
 * - Any edit sends the record back to pending, so changed text or URLs are reviewed before they show again.
 * - Disabling takes effect at once, is audited, and creates no species revision. Re-enabling = edit/approve again.
 * - Every change revalidates the support page and the profiles of published species that show the link.
 * URLs are stored only (https). They are never fetched here; the link checker is M4.
 */
@Injectable()
export class SupportDirectoryService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly revalidation: RevalidationService,
  ) {}

  // ---------- public ----------

  async directory(): Promise<SupportDirectoryDto> {
    const rows = await this.db
      .select({ org: s.organizations, link: s.supportLinks })
      .from(s.organizations)
      .innerJoin(s.supportLinks, and(eq(s.supportLinks.organizationId, s.organizations.id), eq(s.supportLinks.editorialStatus, 'approved')))
      .where(eq(s.organizations.reviewStatus, 'approved'))
      .orderBy(asc(s.organizations.name), asc(s.supportLinks.actionType), asc(s.supportLinks.url));
    const linkIds = rows.map((r) => r.link.id);
    const species = linkIds.length
      ? (
          await this.db.execute<{ support_link_id: string; slug: string; accepted_scientific_name: string; common_name: string | null }>(sql`
            WITH p AS (${PUBLISHED})
            SELECT rsl.support_link_id, p.slug, p.accepted_scientific_name, cn.name AS common_name
            FROM p ${COMMON_NAME} JOIN revision_support_links rsl ON rsl.revision_id = p.revision_id
            WHERE rsl.support_link_id = ANY(${sql.param(linkIds)}::uuid[])
            ORDER BY lower(coalesce(cn.name, p.accepted_scientific_name))`)
        ).rows
      : [];
    const orgs = new Map<string, SupportDirectoryDto['organizations'][number]>();
    for (const { org, link } of rows) {
      let o = orgs.get(org.id);
      if (!o) {
        o = {
          slug: org.slug, name: org.name, website: org.website, websiteDomain: domainOf(org.website), description: org.description,
          reviewedAt: iso(org.reviewedAt), links: [],
        };
        orgs.set(org.id, o);
      }
      o.links.push({
        url: link.url, domain: domainOf(link.url), actionType: link.actionType, description: link.description,
        species: species
          .filter((x) => x.support_link_id === link.id)
          .map((x) => ({ slug: x.slug, scientificName: x.accepted_scientific_name, commonName: x.common_name })),
      });
    }
    return { organizations: [...orgs.values()] };
  }

  // ---------- staff ----------

  async listOrganizations(): Promise<StaffOrganizationDto[]> {
    const [orgs, links] = await Promise.all([
      this.db.select().from(s.organizations).orderBy(asc(s.organizations.name)),
      this.db.select().from(s.supportLinks).orderBy(asc(s.supportLinks.url)),
    ]);
    return orgs.map((o) => ({
      id: o.id, slug: o.slug, name: o.name, website: o.website, description: o.description, reviewStatus: o.reviewStatus,
      reviewedAt: iso(o.reviewedAt), links: links.filter((l) => l.organizationId === o.id).map(toLinkDto),
    }));
  }

  async createOrganization(staff: StaffPrincipal, dto: CreateOrganizationDto): Promise<StaffOrganizationDto> {
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.organizations)
        .values({ slug: dto.slug, name: dto.name, website: dto.website, description: dto.description, reviewStatus: 'pending' })
        .returning({ id: s.organizations.id });
      await audit(tx, { actorId: staff.id, action: 'organization.create', entityType: 'organization', entityId: row.id, summary: `Created organization ${dto.slug} (pending review)` });
      return row.id;
    });
    return this.organization(id);
  }

  async updateOrganization(staff: StaffPrincipal, id: string, dto: UpdateOrganizationDto): Promise<StaffOrganizationDto> {
    await this.changeOrganization(staff, id, 'organization.update', 'Edited; back to pending review', {
      name: dto.name, website: dto.website, description: dto.description, reviewStatus: 'pending',
    });
    return this.organization(id);
  }

  async setOrganizationStatus(staff: StaffPrincipal, id: string, status: Exclude<Status, 'pending'>): Promise<StaffOrganizationDto> {
    const review = status === 'approved' ? { reviewedAt: new Date(), reviewerId: staff.id } : {};
    await this.changeOrganization(staff, id, `organization.${status === 'approved' ? 'approve' : 'disable'}`, status === 'approved' ? 'Approved' : 'Disabled', {
      reviewStatus: status, ...review,
    });
    return this.organization(id);
  }

  async createLink(staff: StaffPrincipal, dto: CreateSupportLinkDto): Promise<StaffSupportLinkDto> {
    const id = await this.db.transaction(async (tx) => {
      const [org] = await tx.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.id, dto.organizationId));
      if (!org) throw new NotFoundException('Organization not found');
      const [row] = await tx
        .insert(s.supportLinks)
        .values({ organizationId: dto.organizationId, url: dto.url, actionType: dto.actionType, description: dto.description, editorialStatus: 'pending' })
        .returning({ id: s.supportLinks.id });
      await audit(tx, { actorId: staff.id, action: 'support_link.create', entityType: 'support_link', entityId: row.id, summary: `Created ${dto.actionType} link to ${domainOf(dto.url)} (pending review)` });
      return row.id;
    });
    return this.link(id);
  }

  async updateLink(staff: StaffPrincipal, id: string, dto: UpdateSupportLinkDto): Promise<StaffSupportLinkDto> {
    await this.changeLink(staff, id, 'support_link.update', `Edited (now ${domainOf(dto.url)}); back to pending review`, {
      url: dto.url, actionType: dto.actionType, description: dto.description, editorialStatus: 'pending',
    });
    return this.link(id);
  }

  async setLinkStatus(staff: StaffPrincipal, id: string, status: Exclude<Status, 'pending'>): Promise<StaffSupportLinkDto> {
    await this.changeLink(staff, id, `support_link.${status === 'approved' ? 'approve' : 'disable'}`, status === 'approved' ? 'Approved' : 'Disabled', {
      editorialStatus: status,
    });
    return this.link(id);
  }

  // ---------- internals ----------

  private async changeOrganization(staff: StaffPrincipal, id: string, action: string, summary: string, set: Partial<typeof s.organizations.$inferInsert>) {
    const linkIds = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(s.organizations).set(set).where(eq(s.organizations.id, id)).returning({ id: s.organizations.id });
      if (!row) throw new NotFoundException('Organization not found');
      await audit(tx, { actorId: staff.id, action, entityType: 'organization', entityId: id, summary });
      return (await tx.select({ id: s.supportLinks.id }).from(s.supportLinks).where(eq(s.supportLinks.organizationId, id))).map((l) => l.id);
    });
    await this.revalidateLinks(linkIds);
  }

  private async changeLink(staff: StaffPrincipal, id: string, action: string, summary: string, set: Partial<typeof s.supportLinks.$inferInsert>) {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.update(s.supportLinks).set(set).where(eq(s.supportLinks.id, id)).returning({ id: s.supportLinks.id });
      if (!row) throw new NotFoundException('Support link not found');
      await audit(tx, { actorId: staff.id, action, entityType: 'support_link', entityId: id, summary });
    });
    await this.revalidateLinks([id]);
  }

  /** After commit: the support page plus every published profile that shows one of these links. */
  private async revalidateLinks(linkIds: string[]) {
    const slugs = linkIds.length ? await publishedSlugsUsing(this.db, linkIds) : [];
    await this.revalidation.revalidate(['support', ...slugs.slice(0, 99).map((x) => `species:${x}`)]);
  }

  private async organization(id: string): Promise<StaffOrganizationDto> {
    const found = (await this.listOrganizations()).find((o) => o.id === id);
    if (!found) throw new NotFoundException('Organization not found');
    return found;
  }

  private async link(id: string): Promise<StaffSupportLinkDto> {
    const [row] = await this.db.select().from(s.supportLinks).where(eq(s.supportLinks.id, id));
    if (!row) throw new NotFoundException('Support link not found');
    return toLinkDto(row);
  }
}

async function publishedSlugsUsing(db: DbOrTx, linkIds: string[]): Promise<string[]> {
  const rows = await db
    .selectDistinct({ slug: s.species.slug })
    .from(s.species)
    .innerJoin(s.revisionSupportLinks, eq(s.revisionSupportLinks.revisionId, s.species.publishedRevisionId))
    .where(inArray(s.revisionSupportLinks.supportLinkId, linkIds));
  return rows.map((r) => r.slug);
}

function toLinkDto(l: typeof s.supportLinks.$inferSelect): StaffSupportLinkDto {
  return {
    id: l.id, organizationId: l.organizationId, url: l.url, actionType: l.actionType, description: l.description,
    editorialStatus: l.editorialStatus, lastCheckedAt: iso(l.lastCheckedAt), lastStatus: l.lastStatus,
  };
}
