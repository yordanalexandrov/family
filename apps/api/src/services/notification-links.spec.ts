import { describe, expect, it } from 'vitest';
import {
  mealOfTag,
  notificationTag,
  pantryUrl,
  recipeUrl,
} from './notification-links.js';

const MEAL = '3f2b8c1e-5d4a-4b6f-9e7d-1a2b3c4d5e6f';

describe('notificationTag and mealOfTag', () => {
  it('reads the meal back from the tag of each of its reminders', () => {
    expect(mealOfTag(notificationTag.thaw(MEAL))).toBe(MEAL);
    expect(mealOfTag(notificationTag.cook(MEAL))).toBe(MEAL);
  });

  it('reads no meal from the tag of the menu of a week or from anything else', () => {
    expect(mealOfTag(notificationTag.menu('2026-11-09'))).toBeNull();
    expect(mealOfTag('thaw-not-a-meal')).toBeNull();
    expect(mealOfTag(`other-${MEAL}`)).toBeNull();
  });
});

describe('links of the details', () => {
  it('opens the pantry and a recipe', () => {
    expect(pantryUrl()).toBe('/pantry');
    expect(recipeUrl(MEAL)).toBe(`/recipes/${MEAL}`);
  });
});
