-- Data migration: the household appliances (GLOSSARY: Уред) that were the constant `APPLIANCES` in packages/shared
-- until #176. Fixed UUIDs and creation times keep their order; from here on they are changed from „Настройки“.
INSERT INTO "appliance" ("id", "name", "enabled", "created_at") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'air fryer (Cosori CAF-R121-KEU)', true, '2026-10-28T00:00:01Z'),
  ('a0000000-0000-4000-8000-000000000002', 'мултикукър (Ninja SmartLid OL750EU) — готвене под налягане, на пара, бавно готвене, air fryer', true, '2026-10-28T00:00:02Z'),
  ('a0000000-0000-4000-8000-000000000003', 'sous vide', true, '2026-10-28T00:00:03Z'),
  ('a0000000-0000-4000-8000-000000000004', 'вакуум машина — само за сухи продукти, не за течности и маринати с течност', true, '2026-10-28T00:00:04Z'),
  ('a0000000-0000-4000-8000-000000000005', 'кухненски робот ×2 (Bosch MUM5, Philips 7778) — месене, разбиване, рендосване, нарязване', true, '2026-10-28T00:00:05Z'),
  ('a0000000-0000-4000-8000-000000000006', 'пасатор', true, '2026-10-28T00:00:06Z')
ON CONFLICT DO NOTHING;
