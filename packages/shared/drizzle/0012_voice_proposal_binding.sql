CREATE TABLE IF NOT EXISTS "voice_verification_proposals" (
  "proposal_id" text NOT NULL,
  "owner_hash" text NOT NULL CHECK (length("owner_hash") = 64),
  "conversation_hash" text NOT NULL CHECK (length("conversation_hash") = 64),
  "policy_version" text NOT NULL,
  "token_hash" text NOT NULL CHECK (length("token_hash") = 64),
  "token_binding_hash" text NOT NULL CHECK (length("token_binding_hash") = 64),
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending', 'completed', 'cancelled', 'expired')),
  "expires_at" timestamp with time zone NOT NULL,
  "cancelled_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "voice_verification_proposals_identity_pk" PRIMARY KEY (
    "proposal_id", "owner_hash", "conversation_hash", "policy_version"
  ),
  CONSTRAINT "voice_verification_proposals_token_hash_unique" UNIQUE ("token_hash"),
  CONSTRAINT "voice_verification_proposals_token_binding_hash_unique" UNIQUE ("token_binding_hash"),
  CONSTRAINT "voice_verification_proposals_confirmation_identity_unique" UNIQUE (
    "proposal_id", "owner_hash", "conversation_hash", "policy_version", "token_hash", "token_binding_hash"
  ),
  CONSTRAINT "voice_verification_proposals_cancelled_state_check" CHECK (
    ("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)
  ),
  CONSTRAINT "voice_verification_proposals_consumed_state_check" CHECK (
    ("status" = 'completed') = ("consumed_at" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_verification_proposals_pending_lookup_idx"
  ON "voice_verification_proposals" USING btree ("owner_hash", "conversation_hash", "status", "expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_verification_confirmations" (
  "attempt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "proposal_id" text NOT NULL,
  "owner_hash" text NOT NULL CHECK (length("owner_hash") = 64),
  "conversation_hash" text NOT NULL CHECK (length("conversation_hash") = 64),
  "policy_version" text NOT NULL,
  "token_hash" text NOT NULL CHECK (length("token_hash") = 64),
  "token_binding_hash" text NOT NULL CHECK (length("token_binding_hash") = 64),
  "accepted" boolean NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "voice_verification_confirmations_proposal_binding_fk" FOREIGN KEY (
    "proposal_id", "owner_hash", "conversation_hash", "policy_version", "token_hash", "token_binding_hash"
  ) REFERENCES "voice_verification_proposals" (
    "proposal_id", "owner_hash", "conversation_hash", "policy_version", "token_hash", "token_binding_hash"
  ) ON UPDATE RESTRICT ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_verification_confirmations_owner_conversation_idx"
  ON "voice_verification_confirmations" USING btree ("owner_hash", "conversation_hash", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "voice_verification_confirmations_accepted_once_idx"
  ON "voice_verification_confirmations" USING btree (
    "proposal_id", "owner_hash", "conversation_hash", "policy_version", "token_hash", "token_binding_hash"
  ) WHERE "accepted" = true;
