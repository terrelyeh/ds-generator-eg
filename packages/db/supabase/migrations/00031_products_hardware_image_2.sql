-- Second hardware-overview image slot (e.g. rear view). First consumer:
-- Data Center lines — their Hardware Overview page shows up to two callout
-- renders per model ({model}_hardware.png + {model}_hardware_2.png).
--
-- NOT NULL DEFAULT '' to match product_image / hardware_image ('' = never
-- provided — see pitfall #60; writing null there fails silently).

alter table public.products
  add column if not exists hardware_image_2 text not null default '';
