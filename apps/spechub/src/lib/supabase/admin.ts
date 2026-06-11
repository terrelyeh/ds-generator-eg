import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin client with service role key.
 * Only use in server-side code (API routes, server actions, cron jobs).
 * Bypasses RLS. Untyped to avoid Insert type inference issues with complex schemas.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
