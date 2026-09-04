-- Rewrite a product's spec table in one transaction.
--
-- Sync did this as a bare `delete` followed by a loop of inserts, with no
-- transaction around either. Between them the product has no specs at all,
-- and the loop is the slowest part of the slowest line — Cloud AP routinely
-- runs close to the route's 60-second ceiling. A kill anywhere in that window
-- leaves a product with no spec table, or with the first four categories of
-- fifteen, and says nothing: `last_synced_at` is not stamped, so the next
-- run's diff compares against an empty "before" and logs every section as
-- newly added, which is a spurious change_log and a spurious Telegram on top
-- of a datasheet that is now wrong.
--
-- PostgREST runs each request in its own transaction, so moving the whole
-- rewrite into one function makes it all-or-nothing: either the new spec
-- table is there or the old one still is.
--
-- SECURITY INVOKER (the default) on purpose. Only service-role code calls
-- this, and service_role bypasses RLS; a DEFINER function would instead be a
-- way for anyone who later gets EXECUTE to write spec rows that 00048 just
-- took away from them.

create or replace function public.replace_spec_sections(
  p_product_id uuid,
  p_sections jsonb
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_section jsonb;
  v_section_id uuid;
  v_items integer := 0;
begin
  delete from public.spec_sections where product_id = p_product_id;

  for v_section in select * from jsonb_array_elements(coalesce(p_sections, '[]'::jsonb))
  loop
    insert into public.spec_sections (product_id, category, sort_order)
    values (
      p_product_id,
      v_section->>'category',
      coalesce((v_section->>'sort_order')::int, 0)
    )
    returning id into v_section_id;

    insert into public.spec_items (section_id, label, value, sort_order)
    select
      v_section_id,
      i->>'label',
      i->>'value',
      coalesce((i->>'sort_order')::int, 0)
    from jsonb_array_elements(coalesce(v_section->'items', '[]'::jsonb)) as i;

    v_items := v_items + coalesce(jsonb_array_length(v_section->'items'), 0);
  end loop;

  return v_items;
end;
$$;

revoke all on function public.replace_spec_sections(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_spec_sections(uuid, jsonb) to service_role;
