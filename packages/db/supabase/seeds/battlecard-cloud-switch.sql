-- Battlecard metadata seed — Cloud Switch.
-- Idempotent. Dimension template + competitors + matchups. EnGenius self values
-- seeded separately from spec_items. No code change needed — the dashboard
-- Battlecard link auto-detects any line that has a dimension template.

-- ── competitors (all exist from earlier lines) ─────────────────────────────
insert into public.competitors (slug, name, brand_family, homepage_url, sort_order) values
  ('ubiquiti',      'Ubiquiti',     'UniFi',  'https://ui.com',                 1),
  ('cisco-meraki',  'Cisco Meraki', 'Meraki', 'https://meraki.cisco.com',       2),
  ('tp-link-omada', 'TP-Link',      'Omada',  'https://www.tp-link.com/omada/', 3)
on conflict (slug) do update set name = excluded.name;

-- ── competitor products (under Cloud Switch) ───────────────────────────────
insert into public.competitor_products (competitor_id, model_name, display_name, product_line_id, sort_order)
select c.id, v.model_name, v.display_name, pl.id, v.sort_order
from (values
  ('ubiquiti',      'USW-Pro-24-PoE',     'UniFi USW-Pro-24-PoE',      1),
  ('ubiquiti',      'USW-Pro-Max-24-PoE', 'UniFi USW-Pro-Max-24-PoE',  2),
  ('cisco-meraki',  'MS130-24P',          'Meraki MS130-24P',          3),
  ('tp-link-omada', 'SG3428MP',           'Omada SG3428MP',            4),
  ('tp-link-omada', 'SG3428XPP-M',        'Omada SG3428XPP-M',         5)
) as v(comp_slug, model_name, display_name, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.product_lines pl on pl.name = 'Cloud Switch'
on conflict (competitor_id, model_name) do update set
  display_name = excluded.display_name, product_line_id = excluded.product_line_id, sort_order = excluded.sort_order;

-- ── matchups (relational tier) ─────────────────────────────────────────────
insert into public.competitor_matchups (product_line_id, anchor_model_name, competitor_product_id, tier, sort_order)
select pl.id, v.anchor, cp.id, v.tier, v.sort_order
from (values
  ('ECS1528P',  'ubiquiti',      'USW-Pro-24-PoE',     1, 1),
  ('ECS1528P',  'cisco-meraki',  'MS130-24P',          1, 2),
  ('ECS1528P',  'tp-link-omada', 'SG3428MP',           2, 3),
  ('ECS2528FP', 'ubiquiti',      'USW-Pro-Max-24-PoE', 1, 4),
  ('ECS2528FP', 'tp-link-omada', 'SG3428XPP-M',        2, 5)
) as v(anchor, comp_slug, comp_model, tier, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.competitor_products cp on cp.competitor_id = c.id and cp.model_name = v.comp_model
join public.product_lines pl on pl.name = 'Cloud Switch'
on conflict (anchor_model_name, competitor_product_id) do update set tier = excluded.tier, sort_order = excluded.sort_order;

-- ── dimension template (Cloud Switch battlecard rows) ──────────────────────
insert into public.battlecard_dimensions (product_line_id, category, dimension_key, label, unit, sort_order)
select pl.id, v.category, v.dimension_key, v.label, nullif(v.unit, ''), v.sort_order
from (values
  ('Ports & Capacity', 'total_ports',        'Total Ports',            '',     10),
  ('Ports & Capacity', 'multigig_ports',     'Multi-Gig Ports',        '',     20),
  ('Ports & Capacity', 'sfp_uplinks',        'SFP / SFP+ Uplinks',     '',     30),
  ('Ports & Capacity', 'switching_capacity', 'Switching Capacity',     'Gbps', 40),
  ('Ports & Capacity', 'mac_table',          'MAC Address Table',      '',     50),
  ('PoE',              'poe_ports',          'PoE Ports',              '',     60),
  ('PoE',              'poe_standard',       'PoE Standard',           '',     70),
  ('PoE',              'poe_budget',         'Total PoE Budget',       'W',    80),
  ('Switching / L2-L3','management_layer',   'Management Layer',       '',     90),
  ('Switching / L2-L3','vlan',               'VLAN (802.1Q)',          '',    100),
  ('Switching / L2-L3','link_aggregation',   'Link Aggregation (LACP)','',    110),
  ('Switching / L2-L3','stp',                'Spanning Tree',          '',    120),
  ('Switching / L2-L3','igmp_mld',           'IGMP / MLD Snooping',    '',    130),
  ('Switching / L2-L3','acl',                'ACL',                    '',    140),
  ('Switching / L2-L3','qos',                'QoS',                    '',    150),
  ('Switching / L2-L3','static_routing',     'Static Routing (L3)',    '',    160),
  ('Switching / L2-L3','stacking',           'Stacking',               '',    170),
  ('Management / Commercial','cloud_management','Cloud Management',    '',    180),
  ('Management / Commercial','local_management','Local GUI / CLI',     '',    190),
  ('Management / Commercial','license_model', 'License Model',         '',    200),
  ('Management / Commercial','warranty',      'Warranty',              '',    210),
  ('Management / Commercial','msrp',          'MSRP / List Price',     '',    220),
  ('Physical',         'form_factor',        'Form Factor',            '',    230),
  ('Physical',         'operating_temp',     'Operating Temperature',  '',    240),
  ('Physical',         'dimensions',         'Dimensions',             'mm',  250),
  ('Physical',         'weight',             'Weight',                 '',    260)
) as v(category, dimension_key, label, unit, sort_order)
join public.product_lines pl on pl.name = 'Cloud Switch'
on conflict (product_line_id, dimension_key) do update set
  category = excluded.category, label = excluded.label, unit = excluded.unit, sort_order = excluded.sort_order;
