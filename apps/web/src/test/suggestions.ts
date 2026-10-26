import type {
  RecipeSuggestion,
  Suggestion,
  SuggestionFailure,
  SuggestionRequest,
} from '@family/shared';
import { dani } from './msw';

// Фикстури за предложенията (#26): заявка и предложенията ѝ по `recipe.suggest`.
export const requestId = 'cccccccc-0000-4000-8000-000000000001';

export const pendingRequest: SuggestionRequest = {
  id: requestId,
  slots: ['dinner'],
  times: ['15-30'],
  tags: ['quick'],
  hint: 'нещо с пиле',
  status: 'pending',
  requestedBy: dani.id,
  createdAt: '2026-10-25T18:00:00.000Z',
};

export const doneRequest: SuggestionRequest = {
  ...pendingRequest,
  status: 'done',
  finishedAt: '2026-10-25T18:01:00.000Z',
};

export function failedRequest(error: SuggestionFailure): SuggestionRequest {
  return {
    ...pendingRequest,
    status: 'failed',
    error,
    finishedAt: '2026-10-25T18:03:00.000Z',
  };
}

export const chickenSkewers: Suggestion = {
  title: 'Пилешки шишчета',
  sourceUrl: 'https://recepti.example/pileshki-shishcheta',
  why: 'Бързо е и децата го обичат.',
  prepMinutes: 25,
  servings: 4,
  tags: ['dinner', 'quick'],
  ingredients: [
    { name: 'пилешко филе', isNew: false, quantity: 0.6, unit: 'kg' },
    { name: 'сумак', isNew: true, quantity: 1, unit: 'tsp' },
    { name: 'сол', isNew: false, quantity: null, unit: 'pinch' },
  ],
  steps: ['Нарежи пилето.', 'Нанижи и изпечи.'],
};

export const lentilSoup: Suggestion = {
  title: 'Леща чорба',
  sourceUrl: 'https://supichki.example/leshta',
  why: 'Топло и сито за вечер.',
  prepMinutes: 30,
  servings: 6,
  tags: ['dinner'],
  ingredients: [
    { name: 'леща', isNew: false, quantity: 300, unit: 'g' },
    { name: 'лук', isNew: false, quantity: 1, unit: 'pcs' },
  ],
  steps: ['Запържи лука.', 'Свари лещата с лука.'],
};

export const omeletteSuggestion: Suggestion = {
  title: 'Омлет с билки',
  sourceUrl: 'https://www.zakuski.example/omlet',
  why: 'Става за десет минути.',
  prepMinutes: 10,
  servings: 2,
  tags: ['dinner', 'quick'],
  ingredients: [
    { name: 'яйце', isNew: false, quantity: 4, unit: 'pcs' },
    { name: 'сол', isNew: false, quantity: null, unit: 'pinch' },
  ],
  steps: ['Разбий яйцата със солта.', 'Изпечи ги в тиган.'],
};

export const skewersSuggestion: RecipeSuggestion = {
  id: 'dddddddd-0000-4000-8000-000000000001',
  requestId,
  payload: chickenSkewers,
  status: 'proposed',
};

export const soupSuggestion: RecipeSuggestion = {
  id: 'dddddddd-0000-4000-8000-000000000002',
  requestId,
  payload: lentilSoup,
  status: 'rejected',
  decidedBy: dani.id,
  decidedAt: '2026-10-25T18:05:00.000Z',
};

export const omeletteSuggestionApproved: RecipeSuggestion = {
  id: 'dddddddd-0000-4000-8000-000000000003',
  requestId,
  payload: omeletteSuggestion,
  status: 'approved',
  recipeId: 'bbbbbbbb-0000-4000-8000-000000000009',
  decidedBy: dani.id,
  decidedAt: '2026-10-25T18:06:00.000Z',
};

export const suggestions = [
  skewersSuggestion,
  soupSuggestion,
  omeletteSuggestionApproved,
];
