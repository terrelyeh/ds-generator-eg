-- Store the key encrypted-at-rest (AES-256-GCM) so admins can re-copy it from
-- the list. Verification still uses key_hash; this column is only decrypted
-- on an explicit admin "reveal" request, using a secret held in env
-- (API_KEY_ENC_SECRET) — never stored in the DB.
alter table public.api_keys add column if not exists key_encrypted text;
