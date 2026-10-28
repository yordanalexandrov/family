import { describe, expect, it } from 'vitest';
import { importFromShare } from './share-target';

const LINK = 'https://bonapeti.example/recepti/tikvenik';

describe('importFromShare', () => {
  it('линк в `url` → внасяне от линк', () => {
    expect(importFromShare({ title: 'Тиквеник', url: LINK })).toEqual({
      kind: 'url',
      url: LINK,
    });
  });

  it('линк само в `text` (Chrome и много приложения) → първият линк от текста', () => {
    expect(
      importFromShare({
        title: 'Тиквеник',
        text: `Виж това: ${LINK}, и после https://drugo.example/x.`,
      }),
    ).toEqual({ kind: 'url', url: LINK });
  });

  it('линкът в края на изречение е без точката', () => {
    expect(importFromShare({ text: `Рецептата е тук: ${LINK}.` })).toEqual({
      kind: 'url',
      url: LINK,
    });
  });

  it('`url`, който не е уеб линк, не се брои; линкът от `text` печели', () => {
    expect(
      importFromShare({ url: 'content://notes/12', text: `от ${LINK}` }),
    ).toEqual({ kind: 'url', url: LINK });
  });

  it('само текст → внасяне от текст, със заглавието отгоре', () => {
    expect(
      importFromShare({
        title: 'Тиквеник',
        text: 'Продукти: 500 г тиква, кори',
      }),
    ).toEqual({
      kind: 'text',
      text: 'Тиквеник\n\nПродукти: 500 г тиква, кори',
    });
  });

  it('заглавието не се повтаря, ако текстът вече започва с него', () => {
    expect(
      importFromShare({
        title: 'Тиквеник',
        text: 'Тиквеник\nПродукти: 500 г тиква',
      }),
    ).toEqual({ kind: 'text', text: 'Тиквеник\nПродукти: 500 г тиква' });
  });

  it('празно или само заглавие → нищо', () => {
    expect(importFromShare({})).toBeNull();
    expect(importFromShare({ text: '   ' })).toBeNull();
    expect(importFromShare({ title: 'Тиквеник' })).toBeNull();
  });
});
