/**
 * Loads the SYNTHETIC development fixtures (src/fixtures/dev-fixtures.ts) and publishes them through the
 * real editorial workflow, so the publication checklist and database triggers apply to them too.
 *
 *   npm run db:seed:regions && npm run db:seed:fixtures
 *
 * Idempotent: species that already exist are skipped. Refuses to run when NODE_ENV=production.
 */
import { config } from 'dotenv';
config({ quiet: true });
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, inArray } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { DB, Db } from '../db/db.module';
import * as s from '../db/schema';
import { EditorialService } from '../editorial/editorial.service';
import { FIXTURE_HABITATS, FIXTURE_LINKS, FIXTURE_ORGANIZATION, FIXTURE_SOURCE_TITLE, FIXTURE_SPECIES, FIXTURE_THREATS, FixtureLinkKey } from '../fixtures/dev-fixtures';
import type { StaffPrincipal } from '../identity/session.service';
import { SupportDirectoryService } from '../support-directory/support-directory.service';

const FIXTURE_ADMIN_EMAIL = 'fixtures@example.invalid';

export async function seedFixtures(app: INestApplicationContext): Promise<{ created: string[]; skipped: string[] }> {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to load synthetic fixtures with NODE_ENV=production');
  const db = app.get<Db>(DB);
  const editorial = app.get(EditorialService);

  // A fixture author without a password: it can never sign in.
  await db.insert(s.staffUsers).values({ email: FIXTURE_ADMIN_EMAIL, name: 'Fixture loader', role: 'admin' }).onConflictDoNothing();
  const [admin] = await db.select().from(s.staffUsers).where(eq(s.staffUsers.email, FIXTURE_ADMIN_EMAIL));
  const staff: StaffPrincipal = { id: admin.id, name: admin.name, email: admin.email, role: 'admin', sessionId: 'cli', csrfToken: 'cli' };

  let [source] = await db.select().from(s.sources).where(eq(s.sources.title, FIXTURE_SOURCE_TITLE));
  source ??= (await db.insert(s.sources).values({ title: FIXTURE_SOURCE_TITLE, publisher: 'Wildward development fixtures' }).returning())[0];

  await db.insert(s.habitats).values(FIXTURE_HABITATS).onConflictDoNothing();
  await db.insert(s.threats).values(FIXTURE_THREATS).onConflictDoNothing();
  const habitatIds = new Map((await db.select().from(s.habitats)).map((h) => [h.code, h.id]));
  const threatIds = new Map((await db.select().from(s.threats)).map((t) => [t.code, t.id]));

  const slugs = [...new Set(FIXTURE_SPECIES.flatMap((f) => [...f.regions.map((r) => r.slug), ...f.assessments.flatMap((a) => a.region ?? []), ...f.estimates.flatMap((e) => e.region ?? [])]))];
  const regionIds = new Map((await db.select({ id: s.regions.id, slug: s.regions.slug }).from(s.regions).where(inArray(s.regions.slug, slugs))).map((r) => [r.slug, r.id]));
  const missing = slugs.filter((x) => !regionIds.has(x));
  if (missing.length) throw new Error(`Regions missing (${missing.join(', ')}). Run npm run db:seed:regions first.`);
  const regionId = (slug?: string) => (slug ? regionIds.get(slug)! : null);

  // Synthetic support directory, reviewed through the real admin workflow (one approved link, one disabled).
  const directory = app.get(SupportDirectoryService);
  const linkIds = new Map<FixtureLinkKey, string>();
  let [org] = await db.select().from(s.organizations).where(eq(s.organizations.slug, FIXTURE_ORGANIZATION.slug));
  if (!org) {
    const createdOrg = await directory.createOrganization(staff, FIXTURE_ORGANIZATION);
    await directory.setOrganizationStatus(staff, createdOrg.id, 'approved');
    for (const l of Object.values(FIXTURE_LINKS)) {
      const link = await directory.createLink(staff, { organizationId: createdOrg.id, url: l.url, actionType: l.actionType, description: l.description });
      if (l.status === 'disabled') await directory.setLinkStatus(staff, link.id, 'approved');
      await directory.setLinkStatus(staff, link.id, l.status);
    }
    [org] = await db.select().from(s.organizations).where(eq(s.organizations.slug, FIXTURE_ORGANIZATION.slug));
  }
  for (const l of await db.select().from(s.supportLinks).where(eq(s.supportLinks.organizationId, org.id))) {
    const key = (Object.keys(FIXTURE_LINKS) as FixtureLinkKey[]).find((k) => FIXTURE_LINKS[k].url === l.url);
    if (key) linkIds.set(key, l.id);
  }

  const created: string[] = [];
  const skipped: string[] = [];
  for (const f of FIXTURE_SPECIES) {
    const [exists] = await db.select({ id: s.species.id }).from(s.species).where(eq(s.species.slug, f.slug));
    if (exists) {
      skipped.push(f.slug);
      continue;
    }
    const draft = await editorial.createSpecies(staff, {
      slug: f.slug, acceptedScientificName: f.scientificName, rank: 'species', displayGroup: f.displayGroup, locationSensitivity: f.sensitivity,
    });
    await editorial.addIdentifier(staff, draft.speciesId, { provider: 'fixture', externalId: f.slug });

    const cite = (sectionKey: 'overview' | 'biology' | 'climate' | 'population' | 'status') => ({ sectionKey, sourceId: source.id, locator: 'synthetic' });
    const citations = [cite('overview')];
    if (f.editorial.measurements?.length) citations.push(cite('biology'));
    if (f.editorial.climate?.ranges?.length) citations.push(cite('climate'));

    const saved = await editorial.saveDraft(staff, draft.id, {
      expectedUpdatedAt: draft.updatedAt,
      displayGroup: f.displayGroup,
      editorial: f.editorial as Record<string, unknown>,
      names: [
        { language: 'en', name: f.commonName, nameType: 'common', preferred: true },
        ...(f.synonyms ?? []).map((name) => ({ language: 'la', name, nameType: 'synonym' as const, preferred: false })),
      ],
      environments: f.environments,
      assessments: f.assessments.map(({ region, ...a }) => ({ ...a, sourceId: source.id, regionId: regionId(region) })),
      populationEstimates: f.estimates.map(({ region, ...e }) => ({ ...e, sourceId: source.id, regionId: regionId(region) })),
      regions: f.regions.map((r) => ({
        regionId: regionId(r.slug)!, presence: 'extant', origin: r.origin ?? 'native', seasonality: r.seasonality ?? 'resident', sourceId: source.id,
      })),
      habitats: f.habitats.map((code) => ({ habitatId: habitatIds.get(code)!, sourceId: source.id })),
      threats: f.threats.map((code) => ({ threatId: threatIds.get(code)!, sourceId: source.id })),
      ranges: (f.ranges ?? []).map((r) => ({ sourceId: source.id, seasonality: r.seasonality ?? 'resident', presence: 'extant', geometry: r.geometry })),
      citations,
      media: [],
      supportLinks: (f.supportLinks ?? []).map((k) => ({ supportLinkId: linkIds.get(k)!, contextNote: null })),
    });
    await editorial.submit(staff, saved.id);
    await editorial.publish(staff, saved.id);
    created.push(f.slug);
  }
  return { created, skipped };
}

if (require.main === module) {
  (async () => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    try {
      const r = await seedFixtures(app);
      console.log(`fixtures: created ${r.created.length} (${r.created.join(', ') || 'none'}), skipped ${r.skipped.length}`);
    } finally {
      await app.close();
    }
  })().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
