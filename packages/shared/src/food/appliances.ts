/**
 * The household's special appliances (GLOSSARY: Уред), each "kind (model) — what it can do / limit", in Bulgarian.
 * `recipe.suggest` prefers recipes for them; the oven, hob and ordinary pots are always there and not listed.
 * Changed with a PR.
 */
export const APPLIANCES: readonly string[] = [
  'air fryer (Cosori CAF-R121-KEU)',
  'мултикукър (Ninja SmartLid OL750EU) — готвене под налягане, на пара, бавно готвене, air fryer',
  'sous vide',
  'вакуум машина — само за сухи продукти, не за течности и маринати с течност',
  'кухненски робот ×2 (Bosch MUM5, Philips 7778) — месене, разбиване, рендосване, нарязване',
  'пасатор',
];
