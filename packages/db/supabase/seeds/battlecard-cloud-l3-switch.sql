-- Battlecard metadata seed — Cloud L3 Switch (core/aggregation).
-- Idempotent. Dimension template (L3/core-focused) + competitors + matchups.
-- EnGenius self values seeded separately from spec_items. Data-only — rides the
-- auto-detect dashboard gate.

-- ── competitors (ubiquiti/meraki exist; aruba is new) ──────────────────────
insert into public.competitors (slug, name, brand_family, homepage_url, sort_order) values
  ('ubiquiti',     'Ubiquiti',     'UniFi',  'https://ui.com',           1),
  ('cisco-meraki', 'Cisco Meraki', 'Meraki', 'https://meraki.cisco.com', 2),
  ('aruba',        'HPE Aruba',    'Aruba CX','https://www.arubanetworks.com', 5)
on conflict (slug) do update set name = excluded.name;

-- ── competitor products (under Cloud L3 Switch) ────────────────────────────
insert into public.competitor_products (competitor_id, model_name, display_name, product_line_id, sort_order)
select c.id, v.model_name, v.display_name, pl.id, v.sort_order
from (values
  ('ubiquiti',     'USW-Pro-Aggregation', 'UniFi USW-Pro-Aggregation', 1),
  ('cisco-meraki', 'MS355-24X2',          'Meraki MS355-24X2',         2),
  ('aruba',        'CX 6300M',            'Aruba CX 6300M',            3),
  ('cisco-meraki', 'MS390-48',            'Meraki MS390-48',           4)
) as v(comp_slug, model_name, display_name, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.product_lines pl on pl.name = 'Cloud L3 Switch'
on conflict (competitor_id, model_name) do update set
  display_name = excluded.display_name, product_line_id = excluded.product_line_id, sort_order = excluded.sort_order;

-- ── matchups ───────────────────────────────────────────────────────────────
insert into public.competitor_matchups (product_line_id, anchor_model_name, competitor_product_id, tier, sort_order)
select pl.id, v.anchor, cp.id, v.tier, v.sort_order
from (values
  ('ECS6824F', 'ubiquiti',     'USW-Pro-Aggregation', 1, 1),
  ('ECS6824F', 'cisco-meraki', 'MS355-24X2',          1, 2),
  ('ECS8830F', 'aruba',        'CX 6300M',            1, 3),
  ('ECS8830F', 'cisco-meraki', 'MS390-48',            2, 4)
) as v(anchor, comp_slug, comp_model, tier, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.competitor_products cp on cp.competitor_id = c.id and cp.model_name = v.comp_model
join public.product_lines pl on pl.name = 'Cloud L3 Switch'
on conflict (anchor_model_name, competitor_product_id) do update set tier = excluded.tier, sort_order = excluded.sort_order;

-- ── dimension template (L3 / core switch battlecard rows) ──────────────────
insert into public.battlecard_dimensions (product_line_id, category, dimension_key, label, unit, sort_order)
select pl.id, v.category, v.dimension_key, v.label, nullif(v.unit, ''), v.sort_order
from (values
  ('Ports & Capacity', 'port_config',        'Port Configuration',       '',     10),
  ('Ports & Capacity', 'uplinks_high',       '40/100G Uplinks',          '',     20),
  ('Ports & Capacity', 'switching_capacity', 'Switching Capacity',       'Gbps', 30),
  ('Ports & Capacity', 'forwarding_rate',    'Forwarding Rate',          'Mpps', 40),
  ('Ports & Capacity', 'mac_table',          'MAC Address Table',        '',     50),
  ('L3 Routing',       'routing_table',      'Routing Table',            '',     60),
  ('L3 Routing',       'static_routing',     'Static Routing',           '',     70),
  ('L3 Routing',       'ospf',               'OSPF',                     '',     80),
  ('L3 Routing',       'bgp',                'BGP',                      '',     90),
  ('L3 Routing',       'isis',               'IS-IS',                    '',    100),
  ('L3 Routing',       'ecmp',               'ECMP',                     '',    110),
  ('L3 Routing',       'vrrp',               'VRRP (gateway redundancy)','',    120),
  ('L3 Routing',       'vrf',                'VRF',                      '',    130),
  ('L3 Routing',       'pim',                'PIM (L3 multicast)',       '',    140),
  ('L2 / HA',          'vlan',               'VLAN',                     '',    150),
  ('L2 / HA',          'link_aggregation',   'Link Aggregation (LACP)',  '',    160),
  ('L2 / HA',          'mc_lag',             'MC-LAG',                   '',    170),
  ('L2 / HA',          'stacking',           'Stacking',                 '',    180),
  ('Data Center / Metro','vxlan',            'VXLAN',                    '',    190),
  ('Data Center / Metro','mpls',             'MPLS L2/L3 VPN',           '',    200),
  ('Management / Security','acl',            'ACL',                      '',    210),
  ('Management / Security','automation',     'Automation (sFlow/NETCONF/Telemetry)','',220),
  ('Management / Security','cloud_management','Cloud Management',        '',    230),
  ('Management / Security','license_model',  'License Model',            '',    240),
  ('Physical / Commercial','redundant_psu',  'Redundant PSU / Fans',     '',    250),
  ('Physical / Commercial','form_factor',    'Form Factor',              '',    260),
  ('Physical / Commercial','operating_temp', 'Operating Temperature',    '',    270),
  ('Physical / Commercial','dimensions',     'Dimensions',               'mm',  280),
  ('Physical / Commercial','warranty',       'Warranty',                 '',    290),
  ('Physical / Commercial','msrp',           'MSRP / List Price',        '',    300)
) as v(category, dimension_key, label, unit, sort_order)
join public.product_lines pl on pl.name = 'Cloud L3 Switch'
on conflict (product_line_id, dimension_key) do update set
  category = excluded.category, label = excluded.label, unit = excluded.unit, sort_order = excluded.sort_order;
