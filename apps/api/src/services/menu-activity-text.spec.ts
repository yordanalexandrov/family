import { describe, expect, it } from 'vitest';
import {
  activityDetails,
  activityTitle,
  voteText,
} from './menu-activity-text.js';

const DANI = { id: 'dani', name: 'Дани' };
const POLI = { id: 'poli', name: 'Поли' };
const GONE = 'gone';
const MONDAY = '2026-11-02';
const MEAL = '3f2b8c1e-5d4a-4b6f-9e7d-1a2b3c4d5e6f';

function action(actorUserId: string, text = 'гласува за „Мусака“') {
  return {
    kind: 'votes' as const,
    mealId: MEAL,
    date: MONDAY,
    text,
    actorUserId,
  };
}

describe('voteText', () => {
  it('names the dish voted on', () => {
    expect(voteText('up', 'Мусака')).toBe('гласува за „Мусака“');
    expect(voteText('down', 'Мусака')).toBe('гласува против „Мусака“');
  });

  it('leaves out the quotes for a meal without a title, instead of empty ones', () => {
    expect(voteText('up', null)).toBe('гласува за');
  });
});

describe('activityDetails', () => {
  it('names who did each action under its day', () => {
    expect(
      activityDetails([action(POLI.id)], new Map([[POLI.id, POLI.name]])),
    ).toEqual([
      {
        text: 'Понеделник: Поли гласува за „Мусака“',
        url: `/menu?week=${MONDAY}&meal=${MEAL}`,
      },
    ]);
  });

  it('says „Някой“ for an actor who is no longer a person, without a double space', () => {
    expect(activityDetails([action(GONE)], new Map())[0]?.text).toBe(
      'Понеделник: Някой гласува за „Мусака“',
    );
  });
});

describe('activityTitle', () => {
  it('names the people who acted', () => {
    expect(activityTitle([action(POLI.id)], [DANI, POLI])).toBe(
      'Поли по менюто',
    );
    expect(
      activityTitle([action(POLI.id), action(DANI.id)], [DANI, POLI]),
    ).toBe('Дани и Поли по менюто');
  });

  it('says „Някой“ when none of them is a person any more', () => {
    expect(activityTitle([action(GONE)], [DANI, POLI])).toBe('Някой по менюто');
  });
});
