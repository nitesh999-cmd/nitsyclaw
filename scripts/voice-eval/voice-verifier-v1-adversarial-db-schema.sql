PRAGMA foreign_keys = ON;

CREATE TABLE voice_proposals (
  proposal_id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  conversation_hash TEXT NOT NULL CHECK (length(conversation_hash) = 64),
  transcript_hash TEXT NOT NULL CHECK (length(transcript_hash) = 64),
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  catalogue_version_hash TEXT NOT NULL CHECK (length(catalogue_version_hash) = 64),
  directory_version_hash TEXT NOT NULL CHECK (length(directory_version_hash) = 64),
  tier INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 4),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'allow_transcript', 'allow_conversation', 'allow_local_preview',
    'require_text_clarification', 'require_text_confirmation',
    'require_text_restatement', 'reject'
  )),
  external_action_allowed INTEGER NOT NULL DEFAULT 0 CHECK (external_action_allowed = 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'cancelled', 'expired', 'invalidated', 'consumed')),
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  CHECK (expires_at_ms >= created_at_ms),
  CHECK ((status = 'consumed' AND consumed_at_ms IS NOT NULL) OR (status <> 'consumed' AND consumed_at_ms IS NULL))
);

CREATE TABLE voice_confirmation_attempts (
  attempt_id TEXT PRIMARY KEY NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES voice_proposals(proposal_id) ON DELETE CASCADE,
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  conversation_hash TEXT NOT NULL CHECK (length(conversation_hash) = 64),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  proposal_snapshot_hash TEXT NOT NULL CHECK (length(proposal_snapshot_hash) = 64),
  accepted INTEGER NOT NULL DEFAULT 0 CHECK (accepted = 0),
  attempted_at_ms INTEGER NOT NULL
);

CREATE TABLE voice_adversarial_audit (
  audit_id TEXT PRIMARY KEY NOT NULL,
  proposal_id TEXT,
  owner_hash TEXT NOT NULL CHECK (length(owner_hash) = 64),
  event_type TEXT NOT NULL,
  transcript_hash TEXT CHECK (transcript_hash IS NULL OR length(transcript_hash) = 64),
  safe_reason_code TEXT NOT NULL,
  detail_redacted TEXT NOT NULL CHECK (
    instr(lower(detail_redacted), 'transcript') = 0 AND
    instr(lower(detail_redacted), 'contact') = 0 AND
    instr(lower(detail_redacted), 'token=') = 0
  ),
  created_at_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX voice_proposal_owner_conversation_id
  ON voice_proposals(owner_hash, conversation_hash, proposal_id);
CREATE INDEX voice_proposal_expiry
  ON voice_proposals(status, expires_at_ms);
CREATE INDEX voice_confirmation_proposal_owner
  ON voice_confirmation_attempts(proposal_id, owner_hash, conversation_hash);
