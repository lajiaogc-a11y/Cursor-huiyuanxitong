-- One-time (optional): force first-time password change for legacy members who still
-- have a non-empty `initial_password` (historical rows before must_change_password was enforced).
--
-- Prerequisites:
--   - Column `must_change_password` exists (created by server startup migration
--     `migrateSchemaPatches` → `addCol('members', 'must_change_password', ...)`).
--   - Column `initial_password` exists on `members` (your app already uses it in INSERT/RPC).
--
-- Run manually after deploy / `npm run migrate:all`, only if you want this policy.
-- Safe to re-run: only updates rows that still have initial_password set and flag was 0/NULL.

-- Preview affected rows:
-- SELECT id, phone_number, member_code,
--        CHAR_LENGTH(COALESCE(initial_password, '')) AS initial_len,
--        must_change_password
-- FROM members
-- WHERE initial_password IS NOT NULL AND TRIM(initial_password) <> '';

UPDATE members
SET must_change_password = 1,
    updated_at = CURRENT_TIMESTAMP(3)
WHERE initial_password IS NOT NULL
  AND TRIM(initial_password) <> ''
  AND COALESCE(must_change_password, 0) = 0;
