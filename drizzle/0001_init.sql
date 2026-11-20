CREATE TYPE "public"."assessment_scope" AS ENUM('global', 'regional');--> statement-breakpoint
CREATE TYPE "public"."display_group" AS ENUM('mammal', 'bird', 'reptile', 'amphibian', 'fish', 'insect', 'arachnid', 'mollusc', 'crustacean', 'coral', 'other_invertebrate');--> statement-breakpoint
CREATE TYPE "public"."editorial_status" AS ENUM('pending', 'approved', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('terrestrial', 'freshwater', 'marine', 'brackish', 'subterranean', 'aerial');--> statement-breakpoint
CREATE TYPE "public"."estimate_form" AS ENUM('exact', 'range', 'at_least', 'at_most', 'qualitative', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."iucn_category" AS ENUM('EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE');--> statement-breakpoint
CREATE TYPE "public"."location_sensitivity" AS ENUM('none', 'generalize_country', 'hide_regions');--> statement-breakpoint
CREATE TYPE "public"."media_review_state" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."name_type" AS ENUM('common', 'synonym');--> statement-breakpoint
CREATE TYPE "public"."origin" AS ENUM('native', 'reintroduced', 'introduced', 'vagrant', 'origin_uncertain');--> statement-breakpoint
CREATE TYPE "public"."population_basis" AS ENUM('mature_individuals', 'breeding_pairs', 'individuals', 'other');--> statement-breakpoint
CREATE TYPE "public"."population_context" AS ENUM('wild', 'captive');--> statement-breakpoint
CREATE TYPE "public"."population_trend" AS ENUM('increasing', 'decreasing', 'stable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."presence" AS ENUM('extant', 'probably_extant', 'possibly_extant', 'possibly_extinct', 'extinct', 'presence_uncertain');--> statement-breakpoint
CREATE TYPE "public"."region_type" AS ENUM('country', 'ocean', 'sea', 'other');--> statement-breakpoint
CREATE TYPE "public"."revision_state" AS ENUM('draft', 'submitted', 'changes_requested', 'published', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."seasonality" AS ENUM('resident', 'breeding', 'non_breeding', 'passage', 'seasonal_uncertain');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."support_action_type" AS ENUM('donate', 'volunteer', 'adopt', 'learn', 'advocate', 'other');--> statement-breakpoint
CREATE TYPE "public"."taxon_rank" AS ENUM('species', 'subspecies');--> statement-breakpoint
CREATE TYPE "public"."token_purpose" AS ENUM('invite', 'reset');--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"provider_assessment_id" text,
	"source_id" uuid NOT NULL,
	"scope" "assessment_scope" DEFAULT 'global' NOT NULL,
	"region_id" uuid,
	"category" "iucn_category" NOT NULL,
	"trend" "population_trend" DEFAULT 'unknown' NOT NULL,
	"assessed_on" date,
	"published_on" date,
	"criteria" text
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habitats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "habitats_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"creator" text NOT NULL,
	"credit" text NOT NULL,
	"license" text NOT NULL,
	"source_url" text,
	"review_state" "media_review_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text NOT NULL,
	"description" text NOT NULL,
	"review_status" "editorial_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" uuid,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "population_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"assessment_id" uuid,
	"source_id" uuid NOT NULL,
	"scope" "assessment_scope" DEFAULT 'global' NOT NULL,
	"region_id" uuid,
	"context" "population_context" DEFAULT 'wild' NOT NULL,
	"basis" "population_basis" NOT NULL,
	"form" "estimate_form" NOT NULL,
	"point_value" bigint,
	"min_value" bigint,
	"max_value" bigint,
	"qualitative_text" text,
	"reference_start" date,
	"reference_end" date,
	"method" text,
	"uncertainty_note" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" "region_type" NOT NULL,
	"iso_a2" text,
	"parent_id" uuid,
	"geom" geometry(MultiPolygon,4326),
	"source_id" uuid,
	CONSTRAINT "regions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "regions_iso_a2_unique" UNIQUE("iso_a2")
);
--> statement-breakpoint
CREATE TABLE "revision_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"source_id" uuid NOT NULL,
	"locator" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "revision_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT 'gallery' NOT NULL,
	"alt_text" text NOT NULL,
	"caption" text,
	"credit_snapshot" text NOT NULL,
	"license_snapshot" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_support_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"support_link_id" uuid NOT NULL,
	"context_note" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"publisher" text,
	"authors" text,
	"url" text,
	"doi" text,
	"published_on" date,
	"accessed_on" date,
	"license" text,
	"permitted_use_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"accepted_scientific_name" text NOT NULL,
	"rank" "taxon_rank" DEFAULT 'species' NOT NULL,
	"parent_species_id" uuid,
	"location_sensitivity" "location_sensitivity" DEFAULT 'none' NOT NULL,
	"published_revision_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "species_slug_unique" UNIQUE("slug"),
	CONSTRAINT "species_published_revision_id_unique" UNIQUE("published_revision_id")
);
--> statement-breakpoint
CREATE TABLE "species_environments" (
	"revision_id" uuid NOT NULL,
	"environment" "environment" NOT NULL,
	CONSTRAINT "species_environments_revision_id_environment_pk" PRIMARY KEY("revision_id","environment")
);
--> statement-breakpoint
CREATE TABLE "species_habitats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"habitat_id" uuid NOT NULL,
	"suitability" text,
	"seasonality" "seasonality",
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text
);
--> statement-breakpoint
CREATE TABLE "species_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"name" text NOT NULL,
	"name_type" "name_type" DEFAULT 'common' NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"geom" geometry(MultiPolygon,4326) NOT NULL,
	"seasonality" "seasonality" DEFAULT 'resident' NOT NULL,
	"presence" "presence" DEFAULT 'extant' NOT NULL,
	"dataset_version" text,
	"generalization_note" text
);
--> statement-breakpoint
CREATE TABLE "species_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"presence" "presence" DEFAULT 'extant' NOT NULL,
	"origin" "origin" DEFAULT 'native' NOT NULL,
	"seasonality" "seasonality" DEFAULT 'resident' NOT NULL,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "revision_state" DEFAULT 'draft' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"display_group" "display_group" NOT NULL,
	"editorial" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_revision_id" uuid,
	"author_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"self_reviewed" boolean DEFAULT false NOT NULL,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "species_threats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"threat_id" uuid NOT NULL,
	"severity" text,
	"timing" text,
	"source_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	CONSTRAINT "staff_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" "token_purpose" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" "staff_role" DEFAULT 'editor' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "support_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"action_type" "support_action_type" NOT NULL,
	"description" text NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_status" integer,
	"editorial_status" "editorial_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	CONSTRAINT "threats_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_staff_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habitats" ADD CONSTRAINT "habitats_parent_id_habitats_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."habitats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_reviewer_id_staff_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_estimates" ADD CONSTRAINT "population_estimates_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_estimates" ADD CONSTRAINT "population_estimates_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_estimates" ADD CONSTRAINT "population_estimates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "population_estimates" ADD CONSTRAINT "population_estimates_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_citations" ADD CONSTRAINT "revision_citations_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_citations" ADD CONSTRAINT "revision_citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_media" ADD CONSTRAINT "revision_media_media_id_media_assets_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_support_links" ADD CONSTRAINT "revision_support_links_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_support_links" ADD CONSTRAINT "revision_support_links_support_link_id_support_links_id_fk" FOREIGN KEY ("support_link_id") REFERENCES "public"."support_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species" ADD CONSTRAINT "species_parent_species_id_species_id_fk" FOREIGN KEY ("parent_species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_environments" ADD CONSTRAINT "species_environments_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_habitats" ADD CONSTRAINT "species_habitats_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_habitats" ADD CONSTRAINT "species_habitats_habitat_id_habitats_id_fk" FOREIGN KEY ("habitat_id") REFERENCES "public"."habitats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_habitats" ADD CONSTRAINT "species_habitats_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_identifiers" ADD CONSTRAINT "species_identifiers_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_names" ADD CONSTRAINT "species_names_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_ranges" ADD CONSTRAINT "species_ranges_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_ranges" ADD CONSTRAINT "species_ranges_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_regions" ADD CONSTRAINT "species_regions_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_regions" ADD CONSTRAINT "species_regions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_regions" ADD CONSTRAINT "species_regions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_revisions" ADD CONSTRAINT "species_revisions_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_revisions" ADD CONSTRAINT "species_revisions_base_revision_id_species_revisions_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_revisions" ADD CONSTRAINT "species_revisions_author_id_staff_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_revisions" ADD CONSTRAINT "species_revisions_reviewer_id_staff_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_threats" ADD CONSTRAINT "species_threats_revision_id_species_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."species_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_threats" ADD CONSTRAINT "species_threats_threat_id_threats_id_fk" FOREIGN KEY ("threat_id") REFERENCES "public"."threats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_threats" ADD CONSTRAINT "species_threats_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tokens" ADD CONSTRAINT "staff_tokens_user_id_staff_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_links" ADD CONSTRAINT "support_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threats" ADD CONSTRAINT "threats_parent_id_threats_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."threats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessments_revision_idx" ON "assessments" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "assessments_category_idx" ON "assessments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "population_revision_idx" ON "population_estimates" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "regions_geom_gist" ON "regions" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "regions_type_idx" ON "regions" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_citations_uq" ON "revision_citations" USING btree ("revision_id","section_key","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_media_uq" ON "revision_media" USING btree ("revision_id","media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_support_links_uq" ON "revision_support_links" USING btree ("revision_id","support_link_id");--> statement-breakpoint
CREATE INDEX "species_environments_env_idx" ON "species_environments" USING btree ("environment");--> statement-breakpoint
CREATE UNIQUE INDEX "species_habitats_uq" ON "species_habitats" USING btree ("revision_id","habitat_id");--> statement-breakpoint
CREATE INDEX "species_habitats_habitat_idx" ON "species_habitats" USING btree ("habitat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_identifiers_provider_ext_uq" ON "species_identifiers" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "species_identifiers_species_idx" ON "species_identifiers" USING btree ("species_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_names_uq" ON "species_names" USING btree ("revision_id","language","name","name_type");--> statement-breakpoint
CREATE INDEX "species_names_revision_idx" ON "species_names" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "species_ranges_geom_gist" ON "species_ranges" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "species_ranges_revision_idx" ON "species_ranges" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_regions_uq" ON "species_regions" USING btree ("revision_id","region_id","seasonality");--> statement-breakpoint
CREATE INDEX "species_regions_region_idx" ON "species_regions" USING btree ("region_id");--> statement-breakpoint
CREATE UNIQUE INDEX "species_revisions_species_version_uq" ON "species_revisions" USING btree ("species_id","version");--> statement-breakpoint
CREATE INDEX "species_revisions_species_state_idx" ON "species_revisions" USING btree ("species_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "species_threats_uq" ON "species_threats" USING btree ("revision_id","threat_id");--> statement-breakpoint
CREATE INDEX "species_threats_threat_idx" ON "species_threats" USING btree ("threat_id");--> statement-breakpoint
CREATE INDEX "staff_sessions_user_idx" ON "staff_sessions" USING btree ("user_id");