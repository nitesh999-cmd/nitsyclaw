-- NitsyClaw rollback for migrations 0011 + 0012 — OPS SCRIPT.
--
-- DESTRUCTIVE. Requires separate explicit owner approval and a stated RPO
-- before it is run. It is NOT a general "if ever needed" rollback: it is only
-- valid inside the bounded window between applying 0011/0012 and the first
-- application write into the four new tables. After that window, the correct
-- response to a problem is FIX FORWARD, or a separately approved
-- data-preserving recovery — not this script.
--
-- Scope is deliberately narrow: it removes ONLY what 0011 and 0012 created.
-- 0009 and 0010 are left completely alone, including their journal rows,
-- because by the time this can run those rows are truthful — drizzle really did
-- execute those files. Rolling them back would re-open the drift this release
-- closes.
--
-- Guards, in order:
--   * advisory lock, the same key the migration runner uses, so this can never
--     race a migration;
--   * journal precondition — refuses unless 0011 and 0012 are both recorded;
--   * EMPTINESS PRECONDITION — refuses if any of the four tables holds a single
--     row, because dropping them would destroy data permanently;
--   * no CASCADE — if anything outside these four ever depends on them, this
--     must fail loudly rather than silently widen its blast radius.
-- Any failed precondition raises and the whole transaction rolls back.
--
-- Usage (single operator process, same session pooler :5432 as the migration):
--   psql "$DATABASE_URL_DIRECT" -v ON_ERROR_STOP=1 -f rollback-0011-0012.ops.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '300s';

DO $$
DECLARE
  n bigint;
  journal_rows int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(82134471) THEN
    RAISE EXCEPTION 'A migration or rollback already holds the advisory lock; refusing to proceed.';
  END IF;

  SELECT count(*) INTO journal_rows
    FROM drizzle.__drizzle_migrations
   WHERE created_at IN (1786458483803, 1786543200000);
  IF journal_rows <> 2 THEN
    RAISE EXCEPTION 'Expected 0011 and 0012 to be recorded (2 journal rows), found %. Refusing.', journal_rows;
  END IF;

  -- Emptiness gate: any row here means real data would be destroyed.
  FOR n IN
    SELECT c FROM (
      SELECT count(*) AS c FROM verified_voice_contacts
      UNION ALL SELECT count(*) FROM verified_voice_products
      UNION ALL SELECT count(*) FROM voice_verification_proposals
      UNION ALL SELECT count(*) FROM voice_verification_confirmations
    ) t
  LOOP
    IF n <> 0 THEN
      RAISE EXCEPTION
        'Refusing destructive rollback: the 0011/0012 tables are not empty. Fix forward, or obtain separate owner approval with a stated RPO.';
    END IF;
  END LOOP;
END $$;

-- Dropped together so the foreign key between the two 0012 tables cannot block
-- the order. No CASCADE, deliberately.
DROP TABLE IF EXISTS
  voice_verification_confirmations,
  voice_verification_proposals,
  verified_voice_products,
  verified_voice_contacts;

-- 1786458483803 = 0011_voice_verification
-- 1786543200000 = 0012_voice_proposal_binding
-- Deleted by created_at, not id, so this cannot drift if serial ids differ.
DELETE FROM drizzle.__drizzle_migrations
 WHERE created_at IN (1786458483803, 1786543200000);

COMMIT;
