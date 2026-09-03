-- Close the row-level policies that were written as "allow all for now" and
-- never revisited.
--
-- What was actually reachable, confirmed against production with the anon key
-- that ships in every page bundle:
--
--   GET /rest/v1/app_settings?select=key,value   → 200, every LLM provider
--                                                   key in clear text
--   GET /rest/v1/product_translations?select=*   → 200
--   PATCH either of the above                    → allowed
--
-- and, for anyone who completed a Google sign-in without being on the
-- whitelist (Supabase issues the session before `handle_new_user` decides
-- whether to create a profile), INSERT/UPDATE on the whole product catalogue
-- plus SELECT on every tender draft.
--
-- The app never needed any of it. A sweep of every file importing
-- `@eg/db/server` — the only client that runs as anon/authenticated — found
-- zero writes: every insert, update and delete in both apps goes through
-- `createAdminClient()` behind an application gate. So the write policies can
-- go entirely, and the read policies only have to cover what those pages
-- actually SELECT.
--
-- Two audiences read through the session client, and they need different
-- things:
--
--   anon          — Puppeteer rendering /preview/[model] and /preview/series
--                   for a PDF. It carries the deployment-protection bypass,
--                   not a Supabase session, so its reads are anonymous.
--                   Needs: products, product_lines, spec_sections, spec_items,
--                   image_assets, line_datasheets, product_translations,
--                   spec_label_translations.
--   authenticated — the signed-in pages under (main), plus the tender print
--                   view, which prints from the user's own browser.
--
-- `app_settings` and `translation_glossary` are in neither list: nothing reads
-- them outside service-role code, so they get no policy at all.
--
-- NOT done here, on purpose: the older `Public read` policies on the product
-- catalogue stay as they are. Narrowing those means changing what the
-- anonymous PDF renderer can see, which is a separate change with its own way
-- of going wrong, and the catalogue is close to public information anyway.
-- The holes this file closes are the secrets and the writes.

begin;

-- ── 1. Whitelist helper ───────────────────────────────────────────────────
-- "Signed in with Google" and "allowed in here" are not the same thing, and
-- until now the database only knew the first one. Modelled on
-- current_user_is_admin() from 00012, including the SECURITY DEFINER +
-- pinned search_path, so a policy can ask the question without recursing
-- through the policies on `profiles`.
create or replace function public.current_user_is_whitelisted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

revoke all on function public.current_user_is_whitelisted() from public;
grant execute on function public.current_user_is_whitelisted() to authenticated, service_role;

-- ── 2. app_settings — service role only ───────────────────────────────────
-- Holds openrouter_api_key, openrouter_api_key_ask, openai_api_key,
-- google_ai_api_key, wifi_reghub_api_key in plain text, next to the
-- typography and the per-model AI settings.
--
-- The last non-admin reader was the PDF preview page, which read
-- `typography_<locale>` with its session client; it now goes through
-- `getSetting()` (service role). Deploy that change BEFORE this migration or
-- every generated PDF silently falls back to default type.
drop policy if exists "Allow all access to app_settings" on public.app_settings;

-- ── 3. Translation tables — read for the renderer, writes to service role ──
drop policy if exists "Allow all access to product_translations" on public.product_translations;
create policy "Public read product_translations" on public.product_translations
  for select using (true);

drop policy if exists "Allow all access to spec_label_translations" on public.spec_label_translations;
create policy "Public read spec_label_translations" on public.spec_label_translations
  for select using (true);

-- The glossary only ever feeds translation prompts from service-role code.
drop policy if exists "Allow all access to translation_glossary" on public.translation_glossary;

-- ── 4. Catalogue writes ───────────────────────────────────────────────────
-- Every one of these was `to authenticated using (true)`: any Google account
-- with a session could rewrite the product data that ends up in customer
-- datasheets and in EnGenie's answers.
drop policy if exists "Authenticated insert products" on public.products;
drop policy if exists "Authenticated update products" on public.products;
drop policy if exists "Authenticated insert spec_sections" on public.spec_sections;
drop policy if exists "Authenticated update spec_sections" on public.spec_sections;
drop policy if exists "Authenticated insert spec_items" on public.spec_items;
drop policy if exists "Authenticated update spec_items" on public.spec_items;
drop policy if exists "Authenticated insert image_assets" on public.image_assets;
drop policy if exists "Authenticated update image_assets" on public.image_assets;
drop policy if exists "Authenticated insert change_logs" on public.change_logs;
drop policy if exists "Authenticated update change_logs" on public.change_logs;
drop policy if exists "Authenticated insert versions" on public.versions;
drop policy if exists "Auth insert comparisons" on public.comparisons;
drop policy if exists "Auth update comparisons" on public.comparisons;
drop policy if exists "Auth insert cloud_comparisons" on public.cloud_comparisons;
drop policy if exists "Auth update cloud_comparisons" on public.cloud_comparisons;
drop policy if exists "Auth insert revision_logs" on public.revision_logs;
drop policy if exists "Auth update revision_logs" on public.revision_logs;

-- ── 5. Tender datasheets and battlecard — whitelisted readers only ────────
-- A tender draft carries the customer's name, the supplier's extracted spec
-- text and our pricing conversation; the battlecard is competitive intel. Both
-- were readable by any authenticated JWT. `(main)` already refuses these pages
-- to anyone without a profile, so this only makes the database agree with the
-- application.
drop policy if exists "project datasheets read" on public.project_datasheets;
create policy "project datasheets read" on public.project_datasheets
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "project datasheet models read" on public.project_datasheet_models;
create policy "project datasheet models read" on public.project_datasheet_models
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "project datasheet questions read" on public.project_datasheet_questions;
create policy "project datasheet questions read" on public.project_datasheet_questions
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "project datasheet sources read" on public.project_datasheet_sources;
create policy "project datasheet sources read" on public.project_datasheet_sources
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "project_datasheet_issues_select" on public.project_datasheet_issues;
create policy "project_datasheet_issues_select" on public.project_datasheet_issues
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "battlecard read competitors" on public.competitors;
create policy "battlecard read competitors" on public.competitors
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "battlecard read competitor_products" on public.competitor_products;
create policy "battlecard read competitor_products" on public.competitor_products
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "battlecard read competitor_matchups" on public.competitor_matchups;
create policy "battlecard read competitor_matchups" on public.competitor_matchups
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "battlecard read battlecard_dimensions" on public.battlecard_dimensions;
create policy "battlecard read battlecard_dimensions" on public.battlecard_dimensions
  for select to authenticated using (public.current_user_is_whitelisted());

drop policy if exists "battlecard read battlecard_values" on public.battlecard_values;
create policy "battlecard read battlecard_values" on public.battlecard_values
  for select to authenticated using (public.current_user_is_whitelisted());

-- ── 6. SECURITY DEFINER functions callable by anon ────────────────────────
-- These three are only ever invoked by `createAdminClient()`, but they were
-- executable straight off /rest/v1/rpc by anyone. `auth_rate_check` was the
-- pointed one: eleven calls with someone else's key locked that IP out of the
-- passcode endpoints for five minutes.
--
-- `current_user_is_admin()` deliberately keeps its grants — RLS policies on
-- `profiles` and `email_whitelist` call it, and a policy is evaluated as the
-- role making the request. `handle_new_user()` is a trigger function, and
-- PostgreSQL does not check EXECUTE when firing a trigger.
revoke all on function public.auth_rate_check(text, integer, integer) from public, anon, authenticated;
grant execute on function public.auth_rate_check(text, integer, integer) to service_role;

revoke all on function public.api_key_touch(text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.api_key_touch(text, timestamp with time zone) to service_role;

revoke all on function public.ask_workspace_touch(text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.ask_workspace_touch(text, timestamp with time zone) to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ── 7. Pin search_path on the remaining functions ─────────────────────────
-- Flagged by Supabase's own linter. None of these is SECURITY DEFINER so the
-- exposure is small, but a mutable search_path in a function that a policy or
-- a trigger reaches is the kind of thing that only matters once.
alter function public.update_updated_at() set search_path = public;
alter function public.profiles_set_updated_at() set search_path = public;
alter function public.knowledge_sources(text) set search_path = public;
alter function public.match_documents(vector, integer, double precision, text, jsonb) set search_path = public;

commit;
