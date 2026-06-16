-- Battlecard metadata seed — Cloud AP MVP.
-- Idempotent (natural-key ON CONFLICT) so it can be re-run safely. Data seed,
-- intentionally NOT a numbered migration (no generated-ID hardcoding).
--
-- Seeds: 3 competitors, 6 competitor products, 6 matchups (relational tier),
-- and the Cloud AP comparison-dimension template (the battlecard rows).
-- Apply with: MCP execute_sql, or `psql < this file`.

-- Cloud AP product_line id is resolved by name (no slug column on product_lines).

-- ── competitors ───────────────────────────────────────────────────────────
insert into public.competitors (slug, name, brand_family, homepage_url, sort_order) values
  ('ubiquiti',      'Ubiquiti',    'UniFi',  'https://ui.com',                  1),
  ('cisco-meraki',  'Cisco Meraki','Meraki', 'https://meraki.cisco.com',        2),
  ('tp-link-omada', 'TP-Link',     'Omada',  'https://www.tp-link.com/omada/',  3)
on conflict (slug) do update set
  name = excluded.name,
  brand_family = excluded.brand_family,
  homepage_url = excluded.homepage_url,
  sort_order = excluded.sort_order;

-- ── competitor_products (all under Cloud AP) ───────────────────────────────
insert into public.competitor_products (competitor_id, model_name, display_name, product_line_id, sort_order)
select c.id, v.model_name, v.display_name, pl.id, v.sort_order
from (values
  ('ubiquiti',      'U7 Pro',  'UniFi U7 Pro',          1),
  ('ubiquiti',      'U6 Pro',  'UniFi U6 Pro',          2),
  ('cisco-meraki',  'CW9164',  'Meraki CW9164',         3),
  ('cisco-meraki',  'MR46',    'Meraki MR46',           4),
  ('tp-link-omada', 'EAP772',  'Omada EAP772',          5),
  ('tp-link-omada', 'EAP670',  'Omada EAP670',          6)
) as v(comp_slug, model_name, display_name, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.product_lines pl on pl.name = 'Cloud AP'
on conflict (competitor_id, model_name) do update set
  display_name = excluded.display_name,
  product_line_id = excluded.product_line_id,
  sort_order = excluded.sort_order;

-- ── competitor_matchups (relational tier) ──────────────────────────────────
insert into public.competitor_matchups (product_line_id, anchor_model_name, competitor_product_id, tier, sort_order)
select pl.id, v.anchor, cp.id, v.tier, v.sort_order
from (values
  ('ECW536', 'ubiquiti',      'U7 Pro', 1, 1),
  ('ECW230', 'ubiquiti',      'U6 Pro', 1, 2),
  ('ECW536', 'cisco-meraki',  'CW9164', 1, 3),
  ('ECW230', 'cisco-meraki',  'MR46',   2, 4),
  ('ECW536', 'tp-link-omada', 'EAP772', 2, 5),
  ('ECW230', 'tp-link-omada', 'EAP670', 2, 6)
) as v(anchor, comp_slug, comp_model, tier, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.competitor_products cp on cp.competitor_id = c.id and cp.model_name = v.comp_model
join public.product_lines pl on pl.name = 'Cloud AP'
on conflict (anchor_model_name, competitor_product_id) do update set
  tier = excluded.tier,
  sort_order = excluded.sort_order;

-- ── battlecard_dimensions (Cloud AP row template) ──────────────────────────
insert into public.battlecard_dimensions (product_line_id, category, dimension_key, label, unit, sort_order)
select pl.id, v.category, v.dimension_key, v.label, nullif(v.unit, ''), v.sort_order
from (values
  ('Wireless / Radio',     'wifi_standard',     'WiFi Standard',          '',     10),
  ('Wireless / Radio',     'radio_bands',       'Frequency Bands',        '',     20),
  ('Wireless / Radio',     'spatial_streams',   'Spatial Streams',        '',     30),
  ('Wireless / Radio',     'max_data_rate',     'Max Aggregate Data Rate','Gbps', 40),
  ('Wireless / Radio',     'channel_width',     'Max Channel Width',      'MHz',  50),
  ('Wireless / Radio',     'mu_mimo',           'MU-MIMO',                '',     60),
  ('Wireless / Radio',     'ofdma',             'OFDMA',                  '',     70),
  ('Wireless / Radio',     'mlo',               'Multi-Link Operation',   '',     80),
  ('Wireless / Radio',     'tx_power',          'Max Tx Power',           'dBm',  90),
  ('Wireless / Radio',     'antenna',           'Antenna',                '',    100),
  ('Capacity',             'max_clients',       'Max Concurrent Clients', '',    110),
  ('Capacity',             'recommended_users', 'Recommended Users',      '',    120),
  ('Capacity',             'bss_coloring',      'BSS Coloring',           '',    130),
  ('Wired / Power',        'ethernet_ports',    'Ethernet Ports',         '',    140),
  ('Wired / Power',        'uplink_speed',      'Max Uplink Speed',       '',    150),
  ('Wired / Power',        'poe_input',         'PoE Input',              '',    160),
  ('Wired / Power',        'power_consumption', 'Max Power Consumption',  'W',   170),
  ('IoT',                  'bluetooth',         'Bluetooth / BLE',        '',    180),
  ('IoT',                  'iot_radio',         'IoT Radio',              '',    190),
  ('Management / License', 'cloud_management',  'Cloud Management',       '',    200),
  ('Management / License', 'license_model',     'License Model',          '',    210),
  ('Management / License', 'local_management',  'Local / On-prem Option', '',    220),
  ('Physical / Commercial','dimensions',        'Dimensions',             'mm',  230),
  ('Physical / Commercial','weight',            'Weight',                 'g',   240),
  ('Physical / Commercial','mounting',          'Mounting',               '',    250),
  ('Physical / Commercial','operating_temp',    'Operating Temperature',  '',    260),
  ('Physical / Commercial','warranty',          'Warranty',               '',    270),
  ('Physical / Commercial','msrp',              'MSRP / List Price',      '',    280)
) as v(category, dimension_key, label, unit, sort_order)
join public.product_lines pl on pl.name = 'Cloud AP'
on conflict (product_line_id, dimension_key) do update set
  category = excluded.category,
  label = excluded.label,
  unit = excluded.unit,
  sort_order = excluded.sort_order;
