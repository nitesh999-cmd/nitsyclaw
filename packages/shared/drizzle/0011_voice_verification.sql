CREATE TABLE IF NOT EXISTS "verified_voice_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_hash" text NOT NULL,
  "display_name_ciphertext" text NOT NULL,
  "channel" text NOT NULL,
  "destination_ciphertext" text NOT NULL,
  "destination_hash" text NOT NULL,
  "masked_destination" text NOT NULL,
  "aliases_ciphertext" text NOT NULL,
  "alias_hashes" jsonb NOT NULL,
  "verification_method" text NOT NULL,
  "verification_evidence_hash" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_voice_contacts_owner_active_idx" ON "verified_voice_contacts" USING btree ("owner_hash","revoked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_voice_contacts_owner_destination_unique_idx" ON "verified_voice_contacts" USING btree ("owner_hash","channel","destination_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verified_voice_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_hash" text NOT NULL,
  "canonical_key" text NOT NULL,
  "brand" text NOT NULL,
  "model" text NOT NULL,
  "aliases" jsonb NOT NULL,
  "verification_method" text NOT NULL,
  "verification_evidence_hash" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_voice_products_owner_active_idx" ON "verified_voice_products" USING btree ("owner_hash","revoked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verified_voice_products_owner_canonical_unique_idx" ON "verified_voice_products" USING btree ("owner_hash","canonical_key");
