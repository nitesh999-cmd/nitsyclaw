PRAGMA foreign_keys = ON;

CREATE TABLE voice_v11_proposals (
  proposal_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL CHECK(length(owner_hash) = 64),
  conversation_hash TEXT NOT NULL CHECK(length(conversation_hash) = 64),
  policy_version TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  token_binding_hash TEXT NOT NULL UNIQUE CHECK(length(token_binding_hash) = 64),
  status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'cancelled', 'expired')),
  expires_at_ms INTEGER NOT NULL,
  cancelled_at_ms INTEGER,
  used_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, owner_hash, conversation_hash, policy_version),
  UNIQUE (
    proposal_id,
    owner_hash,
    conversation_hash,
    policy_version,
    token_hash,
    token_binding_hash
  )
) STRICT;

CREATE TABLE voice_v11_confirmation_attempts (
  attempt_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  owner_hash TEXT NOT NULL CHECK(length(owner_hash) = 64),
  conversation_hash TEXT NOT NULL CHECK(length(conversation_hash) = 64),
  policy_version TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK(length(token_hash) = 64),
  token_binding_hash TEXT NOT NULL CHECK(length(token_binding_hash) = 64),
  accepted INTEGER NOT NULL CHECK(accepted IN (0, 1)),
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (
    proposal_id,
    owner_hash,
    conversation_hash,
    policy_version,
    token_hash,
    token_binding_hash
  ) REFERENCES voice_v11_proposals (
    proposal_id,
    owner_hash,
    conversation_hash,
    policy_version,
    token_hash,
    token_binding_hash
  ) ON UPDATE RESTRICT ON DELETE CASCADE
) STRICT;

CREATE INDEX voice_v11_proposals_state_idx
  ON voice_v11_proposals (owner_hash, conversation_hash, status, expires_at_ms);

CREATE INDEX voice_v11_confirmation_identity_idx
  ON voice_v11_confirmation_attempts (
    proposal_id,
    owner_hash,
    conversation_hash,
    policy_version
  );
