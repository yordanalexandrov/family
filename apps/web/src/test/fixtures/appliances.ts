import type { Appliance } from '@family/shared';

/** Уредите на домакинството по data миграцията на api (`0023_seed_appliances`). */
export const seedAppliances: Appliance[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: 'air fryer (Cosori CAF-R121-KEU)',
    enabled: true,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    name: 'мултикукър (Ninja SmartLid OL750EU) — готвене под налягане, на пара, бавно готвене, air fryer',
    enabled: true,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    name: 'sous vide',
    enabled: true,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    name: 'вакуум машина — само за сухи продукти, не за течности и маринати с течност',
    enabled: true,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    name: 'кухненски робот ×2 (Bosch MUM5, Philips 7778) — месене, разбиване, рендосване, нарязване',
    enabled: true,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    name: 'пасатор',
    enabled: true,
  },
];
