/**
 * Loads our own plain-language habitat and threat lists (codes start with `w-`).
 * They are NOT the IUCN classification schemes, whose licence is still pending (DATA_SOURCES, D-020).
 * Idempotent: upserts by code.
 *
 *   npm run db:seed:vocab
 */
import { loadDotEnv } from '../common/load-env';
loadDotEnv();
import { Pool } from 'pg';

export const HABITATS: Array<[string, string]> = [
  ['w-tropical-forest', 'Tropical forest'],
  ['w-temperate-forest', 'Temperate forest'],
  ['w-montane-forest', 'Mountain forest'],
  ['w-boreal-forest', 'Boreal forest and taiga'],
  ['w-savanna', 'Savanna and open woodland'],
  ['w-grassland', 'Grassland and prairie'],
  ['w-shrubland', 'Scrub and shrubland'],
  ['w-desert', 'Desert and semi-desert'],
  ['w-tundra', 'Tundra'],
  ['w-wetland', 'Wetland, marsh and floodplain'],
  ['w-river-stream', 'Rivers and streams'],
  ['w-lake', 'Lakes'],
  ['w-mangrove', 'Mangrove and estuary'],
  ['w-coastal-marine', 'Coastal and shallow sea'],
  ['w-open-ocean', 'Open ocean'],
  ['w-coral-reef', 'Coral reef'],
  ['w-seagrass', 'Seagrass bed'],
  ['w-sea-ice', 'Sea ice and polar sea'],
  ['w-rocky-coast', 'Rocky coast and sea cliffs'],
  ['w-island', 'Small islands'],
  ['w-cave-burrow', 'Burrows and caves'],
];

export const THREATS: Array<[string, string]> = [
  ['w-habitat-loss', 'Habitat loss and fragmentation'],
  ['w-hunting-poaching', 'Hunting and poaching'],
  ['w-wildlife-trade', 'Illegal wildlife trade'],
  ['w-bycatch', 'Accidental capture in fishing gear'],
  ['w-overfishing', 'Overfishing and over-harvesting'],
  ['w-climate-change', 'Climate change'],
  ['w-human-wildlife-conflict', 'Conflict with people and livestock'],
  ['w-disease', 'Disease'],
  ['w-pollution', 'Pollution and contaminants'],
  ['w-pesticides', 'Pesticides'],
  ['w-lead-poisoning', 'Lead poisoning'],
  ['w-invasive-species', 'Invasive predators and competitors'],
  ['w-prey-decline', 'Decline of prey'],
  ['w-vessel-strike', 'Ship strikes and ocean noise'],
  ['w-dams-water', 'Dams and water extraction'],
  ['w-logging-mining', 'Logging, mining and farming'],
  ['w-infrastructure', 'Collisions with infrastructure and vehicles'],
  ['w-small-population', 'Very small population and low genetic diversity'],
];

export async function seedVocab(pool: Pool): Promise<{ habitats: number; threats: number }> {
  for (const [code, name] of HABITATS) {
    await pool.query('INSERT INTO habitats (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name', [code, name]);
  }
  for (const [code, name] of THREATS) {
    await pool.query('INSERT INTO threats (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name', [code, name]);
  }
  return { habitats: HABITATS.length, threats: THREATS.length };
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  seedVocab(pool)
    .then((r) => console.log(`vocab: ${r.habitats} habitats, ${r.threats} threats`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
