CREATE TABLE "import_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"species_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"imported_hash" text NOT NULL,
	"file_name" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "variants" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "license_url" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "modifications" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_species_id_species_id_fk" FOREIGN KEY ("species_id") REFERENCES "public"."species"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_records_uq" ON "import_records" USING btree ("species_id","section_key");--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_staff_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_reviewed_by_staff_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_sha256_unique" UNIQUE("sha256");