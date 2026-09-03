-- Take anon's EXECUTE off `current_user_is_whitelisted()`.
--
-- 00048 created it with `revoke all ... from public` followed by a grant to
-- authenticated and service_role, which looked like enough. It was not:
-- Supabase ships an ALTER DEFAULT PRIVILEGES rule that grants EXECUTE on
-- every new function in `public` to `anon` and `authenticated` directly, and
-- revoking from PUBLIC does not touch a grant made to a named role. The
-- linter noticed; `pg_proc.proacl` confirmed it.
--
-- Nothing is exposed by this — the function answers a question about the
-- caller, and anon always gets false — but the same oversight on a function
-- that returns something would not be harmless, and the three revokes in
-- 00048 that DID name anon explicitly are the shape to copy.
--
-- `current_user_is_admin()` keeps anon on purpose: the policies on `profiles`
-- and `email_whitelist` are `to public`, so anon evaluates them and needs to
-- be able to call it.

revoke execute on function public.current_user_is_whitelisted() from anon;
