import type {
  ImportedSuggestion,
  Ingredient,
  RecipeImportRequest,
} from '@family/shared';
import { dani } from './msw';
import { chicken, salt } from './recipes';

// Фикстури за внасянето (#102): поставен текст на рецепта и предложението от него.
export const importId = 'eeeeeeee-0000-4000-8000-000000000001';

export const importText = `Пилешки гърди със сумак

Продукти:
- 600 г пилешки гърди
- 1 ч.л. смлян сумак
- сол на вкус

Начин на приготвяне:
Овкусете пилето. Изпечете го 30 минути.`;

export const importUrl = 'https://blog.example/pile-sumak';

export const pendingImport: RecipeImportRequest = {
  id: importId,
  status: 'pending',
  source: 'text',
  url: importUrl,
  requestedBy: dani.id,
  createdAt: '2026-10-27T18:00:00.000Z',
};

export const sumac: Ingredient = {
  id: 'aaaaaaaa-0000-4000-8000-000000000010',
  name: 'сумак',
  unit: 'g',
  aisle: 'spices',
};

export const importedSuggestion: ImportedSuggestion = {
  id: 'dddddddd-0000-4000-8000-000000000020',
  origin: 'import',
  importRequestId: importId,
  status: 'proposed',
  payload: {
    title: 'Пилешко филе със сумак',
    servings: 4,
    prepMinutes: 40,
    tags: ['dinner'],
    assumptions: 'Порциите не са дадени: по количествата са 4.',
    ingredients: [
      {
        ingredientId: chicken.id,
        newProduct: null,
        quantity: 600,
        unit: 'g',
        note: 'пилешки гърди',
      },
      {
        ingredientId: null,
        newProduct: { name: 'сумак', unit: 'g', aisle: 'spices' },
        quantity: 1,
        unit: 'tsp',
        note: 'смлян',
      },
      {
        ingredientId: salt.id,
        newProduct: null,
        quantity: null,
        unit: 'pinch',
        note: null,
      },
    ],
    steps: [{ text: 'Овкусете пилето.' }, { text: 'Изпечете го 30 минути.' }],
  },
};

export const doneImport: RecipeImportRequest = {
  ...pendingImport,
  status: 'done',
  finishedAt: '2026-10-27T18:01:00.000Z',
  suggestionId: importedSuggestion.id,
  title: importedSuggestion.payload.title,
};
