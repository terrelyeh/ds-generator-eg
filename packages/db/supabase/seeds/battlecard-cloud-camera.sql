-- Battlecard metadata seed — Cloud Camera.
-- Idempotent (natural-key ON CONFLICT). Seeds the per-line dimension template,
-- competitors, and matchups. EnGenius self values are seeded separately from
-- spec_items (see the websearch/manual flow for competitor values).

-- ── competitors (ubiquiti already exists from Cloud AP; verkada is new) ─────
insert into public.competitors (slug, name, brand_family, homepage_url, sort_order) values
  ('ubiquiti', 'Ubiquiti', 'UniFi Protect', 'https://ui.com', 1),
  ('verkada',  'Verkada',  'Verkada',        'https://www.verkada.com', 4)
on conflict (slug) do update set name = excluded.name;

-- ── competitor products (under Cloud Camera) ───────────────────────────────
insert into public.competitor_products (competitor_id, model_name, display_name, product_line_id, sort_order)
select c.id, v.model_name, v.display_name, pl.id, v.sort_order
from (values
  ('ubiquiti', 'UVC-G5-Pro',  'UniFi Protect G5 Pro',  1),
  ('ubiquiti', 'UVC-G5-Dome', 'UniFi Protect G5 Dome', 2),
  ('verkada',  'CD52',        'Verkada CD52',          3)
) as v(comp_slug, model_name, display_name, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.product_lines pl on pl.name = 'Cloud Camera'
on conflict (competitor_id, model_name) do update set
  display_name = excluded.display_name, product_line_id = excluded.product_line_id, sort_order = excluded.sort_order;

-- ── matchups (relational tier) ─────────────────────────────────────────────
insert into public.competitor_matchups (product_line_id, anchor_model_name, competitor_product_id, tier, sort_order)
select pl.id, v.anchor, cp.id, v.tier, v.sort_order
from (values
  ('ECC500', 'ubiquiti', 'UVC-G5-Pro',  1, 1),
  ('ECC500', 'verkada',  'CD52',        1, 2),
  ('ECC100', 'ubiquiti', 'UVC-G5-Dome', 1, 3)
) as v(anchor, comp_slug, comp_model, tier, sort_order)
join public.competitors c on c.slug = v.comp_slug
join public.competitor_products cp on cp.competitor_id = c.id and cp.model_name = v.comp_model
join public.product_lines pl on pl.name = 'Cloud Camera'
on conflict (anchor_model_name, competitor_product_id) do update set tier = excluded.tier, sort_order = excluded.sort_order;

-- ── dimension template (Cloud Camera battlecard rows) ──────────────────────
insert into public.battlecard_dimensions (product_line_id, category, dimension_key, label, unit, sort_order)
select pl.id, v.category, v.dimension_key, v.label, nullif(v.unit, ''), v.sort_order
from (values
  ('Imaging / Optics',      'sensor',            'Sensor',                  '',    10),
  ('Imaging / Optics',      'resolution',        'Max Resolution',          '',    20),
  ('Imaging / Optics',      'frame_rate',        'Max Frame Rate',          'FPS', 30),
  ('Imaging / Optics',      'lens',              'Lens',                    '',    40),
  ('Imaging / Optics',      'fov',               'Field of View (H)',       '',    50),
  ('Imaging / Optics',      'wdr',               'WDR',                     '',    60),
  ('Imaging / Optics',      'night_vision',      'Night Vision',            '',    70),
  ('Imaging / Optics',      'ir_distance',       'IR Distance',             'm',   80),
  ('Video / Audio',         'compression',       'Video Compression',       '',    90),
  ('Video / Audio',         'audio',             'Audio (mic / speaker)',   '',   100),
  ('AI Analytics',          'ai_npu',            'On-camera AI (NPU)',      '',   110),
  ('AI Analytics',          'ai_detection',      'People / Vehicle Analytics','',  120),
  ('AI Analytics',          'ai_facial',         'Facial Recognition',      '',   130),
  ('Storage',               'onboard_storage',   'Onboard Storage',         '',   140),
  ('Storage',               'retention',         'Retention',               '',   150),
  ('Storage',               'encryption',        'Recording Encryption',    '',   160),
  ('Storage',               'nvr_cloud',         'NVR / Cloud Storage',     '',   170),
  ('System / Power',        'network_interface', 'Network Interface',       '',   180),
  ('System / Power',        'poe_input',         'PoE Input',               '',   190),
  ('System / Power',        'power_consumption', 'Max Power Consumption',   'W',  200),
  ('System / Power',        'operating_temp',    'Operating Temperature',   '',   210),
  ('Mechanical',            'form_factor',       'Form Factor',             '',   220),
  ('Mechanical',            'weatherproof',      'Weatherproofing',         '',   230),
  ('Mechanical',            'vandal_resistance', 'Vandal Resistance',       '',   240),
  ('Mechanical',            'dimensions',        'Dimensions',              'mm', 250),
  ('Mechanical',            'weight',            'Weight',                  'g',  260),
  ('Management / Commercial','cloud_management', 'Cloud Management',        '',   270),
  ('Management / Commercial','license_model',    'License Model',           '',   280),
  ('Management / Commercial','warranty',         'Warranty',                '',   290),
  ('Management / Commercial','msrp',             'MSRP / List Price',       '',   300)
) as v(category, dimension_key, label, unit, sort_order)
join public.product_lines pl on pl.name = 'Cloud Camera'
on conflict (product_line_id, dimension_key) do update set
  category = excluded.category, label = excluded.label, unit = excluded.unit, sort_order = excluded.sort_order;
