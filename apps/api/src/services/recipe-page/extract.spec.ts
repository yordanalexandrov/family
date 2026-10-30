import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeHtml, extractRecipe, PAGE_TEXT_MAX } from './extract.js';

/** A saved page from `src/test/fixtures/recipe-pages/`, as bytes. */
function page(name: string): Buffer {
  return readFileSync(
    new URL(`../../test/fixtures/recipe-pages/${name}`, import.meta.url),
  );
}

function html(name: string): string {
  return page(name).toString('utf8');
}

describe('extractRecipe: the JSON-LD Recipe', () => {
  it('finds the Recipe in a @graph next to WebPage, WebSite and Person, with only the recipe fields', () => {
    const result = extractRecipe(html('jsonld-graph.html'));

    expect(result).toEqual({
      jsonLd: {
        '@type': 'Recipe',
        name: 'Книжен кебап с гъби',
        description: 'Сочен книжен кебап с гъби и зелен лук, печен в хартия.',
        recipeYield: '4 Порции',
        prepTime: 'PT20M',
        cookTime: 'PT1H10M',
        totalTime: 'PT1H30M',
        recipeCategory: 'Основни ястия',
        recipeCuisine: 'Българска',
        keywords: 'кебап, гъби, свинско',
        recipeIngredient: [
          '600 gram свинско месо',
          '300 gram гъби',
          '3 bunch зелен лук',
          '1 tablespoon червен пипер',
          '100 ml бяло вино',
          'сол на вкус',
        ],
        recipeInstructions: [
          'Нарежете месото на хапки и го овкусете със сол и червен пипер.',
          'Нарежете гъбите и лука и ги смесете с месото.',
          'Разпределете сместа върху листове хартия за печене, полейте с виното и затворете пликчета.',
          'Печете 70 минути на 180 градуса.',
        ],
        nutrition: { calories: '420 kcal', servingSize: '1 порция' },
      },
      stepImages: {},
    });
  });

  it('flattens HowToSection steps under their section names, in a top-level array, with @type as an array', () => {
    const result = extractRecipe(html('jsonld-howtosection.html'));

    expect(result.jsonLd).toMatchObject({
      name: 'Spaghetti Napoli',
      recipeYield: ['4', '4 Portionen'],
      recipeInstructions: [
        {
          section: 'Für die Soße',
          steps: [
            'Zwiebel und Knoblauch fein hacken und im Olivenöl glasig dünsten.',
            'Die Tomaten zugeben, zerdrücken und 20 Minuten köcheln lassen. Mit Salz und Pfeffer abschmecken.',
          ],
        },
        {
          section: 'Für die Nudeln',
          steps: [
            'Die Spaghetti in Salzwasser al dente kochen.',
            'Abgießen und mit der Soße vermischen.',
          ],
        },
      ],
    });
    expect(result.jsonLd).not.toHaveProperty('video');
    expect(result.jsonLd).not.toHaveProperty('review');
    expect(result.text).toBeUndefined();
  });

  it('reads a WordPress recipe plugin page: skips a broken JSON-LD block, decodes entities and drops HTML in strings', () => {
    const result = extractRecipe(html('wordpress-wprm.html'));

    expect(result.jsonLd).toMatchObject({
      name: 'Creamy Cauliflower Soup',
      description:
        'A cozy, creamy cauliflower soup & garlic bread – ready in 40 minutes.',
      recipeYield: ['6', '6 bowls'],
      recipeIngredient: expect.arrayContaining([
        '1 large cauliflower ((about 2 pounds or 1 kilo, cut into florets))',
        'salt & pepper (to taste)',
      ]),
      recipeInstructions: [
        'Melt the butter in a large pot and cook the onion until soft, about 5 minutes.',
        'Add the garlic & cauliflower and cook for 2 minutes.',
        'Pour in the stock, bring to a boil and simmer for 20 minutes.',
        'Blend until smooth, stir in the cream and season with salt and pepper.',
      ],
      nutrition: {
        calories: '180 kcal',
        carbohydrateContent: '12 g',
        proteinContent: '5 g',
        fatContent: '13 g',
        servingSize: '1 serving',
      },
    });
    for (const noise of ['image', 'author', 'aggregateRating', 'review']) {
      expect(result.jsonLd).not.toHaveProperty(noise);
    }
  });
});

describe('extractRecipe: the photos of the steps', () => {
  const PAGE_URL = 'https://panandplate.example/shakshuka/';

  it('puts a reference in place of each HowToStep.image (the first of several) and keeps its URL out of the JSON-LD', () => {
    const result = extractRecipe(html('jsonld-step-images.html'), PAGE_URL);

    expect(result.jsonLd?.recipeInstructions).toEqual([
      {
        section: 'The sauce',
        steps: [
          {
            text: 'Heat the olive oil in a skillet and cook the onion and the pepper for 5 minutes.',
            image: 's1',
          },
          'Add the garlic and the cumin and cook for 1 minute.',
          {
            text: 'Pour in the tomatoes and simmer for 10 minutes.',
            image: 's2',
          },
        ],
      },
      {
        section: 'The eggs',
        steps: [
          {
            text: 'Make 4 wells in the sauce and crack an egg into each. Cover and cook for 6 minutes.',
            image: 's3',
          },
          'Sprinkle with the feta and serve.',
        ],
      },
    ]);
    expect(result.stepImages).toEqual({
      s1: 'https://panandplate.example/wp-content/uploads/shakshuka-step-1.jpg',
      s2: 'https://panandplate.example/wp-content/uploads/shakshuka-step-3.jpg',
      s3: 'https://cdn.panandplate.example/shakshuka-step-4.webp',
    });
    expect(JSON.stringify(result.jsonLd)).not.toMatch(/https?:|data:/);
  });

  it('gives a JSON-LD recipe without step photos no references', () => {
    const result = extractRecipe(html('jsonld-howtosection.html'), PAGE_URL);

    expect(result.stepImages).toEqual({});
    expect(JSON.stringify(result.jsonLd)).not.toContain('"image"');
  });
});

describe('extractRecipe: JSON-LD as sites write it', () => {
  it('tolerates raw line breaks inside JSON-LD strings, as some Bulgarian portals send them', () => {
    const page = `<html><head><script type="application/ld+json">
{"@type": "Recipe", "name": "Лазаня", "recipeIngredient": ["500 г кайма"],
"recipeInstructions": "Редувайте кори и сос.
\tПечете 40 минути."}
</script></head><body></body></html>`;

    expect(extractRecipe(page).jsonLd).toMatchObject({
      name: 'Лазаня',
      recipeInstructions: 'Редувайте кори и сос. Печете 40 минути.',
    });
  });
});

describe('extractRecipe: the page text without a Recipe', () => {
  it('gives a Bulgarian blog post without JSON-LD Recipe as its main text, without scripts, styles, navigation and sidebars', () => {
    const result = extractRecipe(html('bg-blog.html'));

    expect(result.jsonLd).toBeUndefined();
    const text = result.text ?? '';
    expect(text.split('\n')[0]).toBe(
      'Гладни у дома: Тавче гравче по бабина рецепта',
    );
    expect(text).toContain('Необходими продукти (за 4 порции):');
    expect(text).toContain('\n500 г зрял боб\n2 глави кромид лук\n');
    expect(text).toContain('Начин на приготвяне:');
    expect(text).toContain('Поръсва се с магданоз и се сервира топло.');
    for (const noise of [
      '_gaq',
      'font: normal',
      'Blogger навигация',
      'Архив на блога',
      'Предоставено от Blogger',
    ]) {
      expect(text).not.toContain(noise);
    }
  });

  it('cuts a long page to a window around „Продукти“ that keeps the title, the products and the steps', () => {
    const story = `<p>${'Дълга история за лятото при баба. '.repeat(1_500)}</p>`;
    const long = html('bg-blog.html').replace(
      '<div><b>Необходими продукти',
      `${story}<div><b>Необходими продукти`,
    );

    const text = extractRecipe(long).text ?? '';

    expect(text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX);
    expect(text.split('\n')[0]).toBe(
      'Гладни у дома: Тавче гравче по бабина рецепта',
    );
    expect(text).toContain('500 г зрял боб');
    expect(text).toContain('Поръсва се с магданоз и се сервира топло.');
  });

  it('finds „Ingredients“ the same way on an English page', () => {
    const filler = `<p>${'Some long story about autumn. '.repeat(1_500)}</p>`;
    const page = `<html><head><title>Apple Pie</title></head><body>${filler}<h2>Ingredients</h2><ul><li>6 apples</li><li>1 cup sugar</li></ul><h2>Instructions</h2><p>Bake for 50 minutes.</p></body></html>`;

    const text = extractRecipe(page).text ?? '';

    expect(text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX);
    expect(text).toContain('Ingredients\n6 apples\n1 cup sugar');
    expect(text).toContain('Bake for 50 minutes.');
  });
});

describe('decodeHtml', () => {
  it('decodes a windows-1251 page by the charset of the Content-Type header', () => {
    const result = extractRecipe(
      decodeHtml(page('windows-1251.html'), 'text/html; charset=windows-1251'),
    );

    expect(result.jsonLd).toMatchObject({
      name: 'Лазаня болонезе',
      recipeIngredient: expect.arrayContaining(['500 г кайма']),
    });
  });

  it('falls back to <meta charset> when the header names none', () => {
    const bytes = Buffer.concat([
      Buffer.from('<meta charset="windows-1251">'),
      page('windows-1251.html'),
    ]);

    expect(extractRecipe(decodeHtml(bytes, 'text/html')).jsonLd).toMatchObject({
      name: 'Лазаня болонезе',
    });
  });

  it('reads UTF-8 without any charset', () => {
    expect(decodeHtml(page('bg-blog.html'), undefined)).toContain(
      'Тавче гравче',
    );
  });
});
