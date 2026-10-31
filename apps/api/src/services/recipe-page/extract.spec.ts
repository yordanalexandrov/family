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

  it('gives references to the photos of the first 40 steps only, and the rest of the steps as text', () => {
    const steps = Array.from({ length: 45 }, (_, i) => ({
      '@type': 'HowToStep',
      text: `Step ${i + 1}.`,
      image: `https://panandplate.example/step-${i + 1}.jpg`,
    }));
    const page = `<html><head><script type="application/ld+json">${JSON.stringify(
      {
        '@type': 'Recipe',
        name: 'Long',
        recipeIngredient: ['1 egg'],
        recipeInstructions: steps,
      },
    )}</script></head><body></body></html>`;

    const result = extractRecipe(page, PAGE_URL);

    expect(Object.keys(result.stepImages ?? {})).toHaveLength(40);
    expect(result.stepImages?.s40).toBe(
      'https://panandplate.example/step-40.jpg',
    );
    const instructions = result.jsonLd?.recipeInstructions as unknown[];
    expect(instructions[39]).toEqual({ text: 'Step 40.', image: 's40' });
    expect(instructions[40]).toBe('Step 41.');
    expect(instructions[44]).toBe('Step 45.');
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

describe('extractRecipe: the photos in the page text', () => {
  const PAGE_URL =
    'https://www.mycookingbookblog.com/siomga-s-taiatele-v-avokado-sos/';

  /** The references of the markers in the text, in their order. */
  function markers(text: string | undefined): string[] {
    return [...(text ?? '').matchAll(/\[снимка (s\d+)\]/g)].map(
      (match) => match[1] as string,
    );
  }

  it('puts a marker in place of each photo of a microdata recipe and its URL in stepImages, once, without the rating stars', () => {
    const result = extractRecipe(html('wp-microdata.html'), PAGE_URL);

    expect(result.jsonLd).toBeUndefined();
    // The featured photo (again in the post and in the recipe card), then the 14 photos of the post.
    const refs = markers(result.text);
    expect(refs).toEqual(
      Array.from({ length: 15 }, (_, index) => `s${index + 1}`),
    );
    expect(Object.keys(result.stepImages ?? {})).toEqual(refs);
    expect(result.stepImages?.s1).toBe(
      'https://www.mycookingbookblog.com/wp-content/uploads/2017/07/IMG_0899.jpg',
    );
    expect(result.stepImages?.s2).toMatch(
      /^https:\/\/lh3\.googleusercontent\.com\/fCBSq1Ysx.*=w1006-h503-no$/,
    );
    expect(Object.values(result.stepImages ?? {}).join(' ')).not.toContain(
      '1star',
    );
    expect(result.text).not.toContain('googleusercontent');
  });

  /** A post without JSON-LD whose `steps` are its paragraphs, with the products first. */
  function post(steps: string): string {
    return `<html><head><title>Мусака</title></head><body><article><h2>Продукти</h2><p>1 кг картофи</p><h2>Начин на приготвяне</h2>${steps}</article></body></html>`;
  }

  it('takes a lazy-loaded photo by data-src, data-lazy-src or the widest of srcset, relative to the page, and skips icons, avatars and data:', () => {
    const page = post(`
      <p>Обелете картофите.</p>
      <img src="data:image/gif;base64,R0lGOD" data-src="/uploads/kartofi.jpg">
      <p>Нарежете ги.</p>
      <img src="/lazy.gif" data-lazy-src="https://cdn.example.com/nareazani.webp">
      <p>Запържете каймата. <img srcset="/kayma-300.jpg 300w, /kayma-1024.jpg 1024w, /kayma-640.jpg 640w" src="/kayma-300.jpg"></p>
      <img src="/uploads/kartofi.jpg">
      <img src="/smile.png" width="16" height="16">
      <img src="/wp-content/themes/blog/images/logo.png">
      <img class="avatar avatar-48" src="/u/42.jpg">
      <img src="data:image/png;base64,iVBOR">
      <img src="ftp://example.com/photo.jpg">
      <p>Печете 40 минути.</p>`);

    const result = extractRecipe(page, 'https://blog.example.com/musaka/');

    expect(result.text).toBe(
      [
        'Мусака',
        'Продукти',
        '1 кг картофи',
        'Начин на приготвяне',
        'Обелете картофите.',
        '[снимка s1]',
        'Нарежете ги.',
        '[снимка s2]',
        'Запържете каймата. [снимка s3]',
        'Печете 40 минути.',
      ].join('\n'),
    );
    expect(result.stepImages).toEqual({
      s1: 'https://blog.example.com/uploads/kartofi.jpg',
      s2: 'https://cdn.example.com/nareazani.webp',
      s3: 'https://blog.example.com/kayma-1024.jpg',
    });
  });

  it('keeps a photo with a percent width, commas in its srcset or a name like star-anise, and skips a data: srcset placeholder', () => {
    const page = post(`
      <p>Сварете сиропа.</p>
      <img src="/uploads/sirop.jpg" width="50%">
      <p>Добавете звезден анасон.</p>
      <img src="/uploads/star-anise.jpg">
      <p>Подредете в тава.</p>
      <img srcset="https://res.example.com/image/upload/w_320,h_240/tava.jpg 320w, https://res.example.com/image/upload/w_1024,h_768/tava.jpg 1024w">
      <p>Печете.</p>
      <img srcset="data:image/gif;base64,R0lGODlhAQABAAAAACw= 1x" data-src="/uploads/pechene.jpg">
      <img src="/images/icons/print.png">
      <img src="/wp-content/plugins/rating/images/1star.png">
      <img src="https://static.forum.example/Smileys/default/chef.gif">
      <img src="/img/emojis/faces/simple_smile.png">`);

    const result = extractRecipe(page, 'https://blog.example.com/');

    expect(result.stepImages).toEqual({
      s1: 'https://blog.example.com/uploads/sirop.jpg',
      s2: 'https://blog.example.com/uploads/star-anise.jpg',
      s3: 'https://res.example.com/image/upload/w_1024,h_768/tava.jpg',
      s4: 'https://blog.example.com/uploads/pechene.jpg',
    });
  });

  it('gives references to the first 40 photos only, and none to a photo the window cuts out', () => {
    const photos = Array.from(
      { length: 45 },
      (_, index) =>
        `<p>Стъпка ${index + 1}.</p><img src="/p/${index + 1}.jpg">`,
    ).join('');
    const story = `<p>${'Дълга история за лятото при баба. '.repeat(1_000)}</p><img src="/story.jpg">`;

    const many = extractRecipe(post(photos), 'https://blog.example.com/');
    const long = extractRecipe(
      `<html><body><article>${story}<p>${'Още история. '.repeat(500)}</p><h2>Продукти</h2><p>1 кг картофи</p><p>Сварете ги.</p><img src="/p/1.jpg"></article></body></html>`,
      'https://blog.example.com/',
    );

    expect(markers(many.text)).toHaveLength(40);
    expect(Object.keys(many.stepImages ?? {})).toHaveLength(40);
    expect(many.stepImages?.s40).toBe('https://blog.example.com/p/40.jpg');
    expect(many.text).toContain('Стъпка 45.');
    expect(many.text).not.toContain('');

    expect(long.text?.length).toBeLessThanOrEqual(PAGE_TEXT_MAX);
    expect(long.text).toContain('Сварете ги.\n[снимка s1]');
    expect(long.stepImages).toEqual({ s1: 'https://blog.example.com/p/1.jpg' });
  });

  it('keeps the text within PAGE_TEXT_MAX with markers, and gives no reference to a photo the end of the window cuts', () => {
    const photos = Array.from(
      { length: 39 },
      (_, index) =>
        `<p>Стъпка ${index + 1}.</p><img src="/p/${index + 1}.jpg">`,
    ).join('');
    const seen = new Set<number>();

    // The last photo stands right at the end of the window, before it, across it or after it.
    for (let length = 10_900; length < 11_100; length++) {
      const result = extractRecipe(
        post(
          `${photos}<p>${'я'.repeat(length)}</p><img src="/last.jpg"><p>${'Край. '.repeat(500)}</p>`,
        ),
        'https://blog.example.com/',
      );
      const refs = markers(result.text);
      seen.add(refs.length);

      expect(result.text?.length).toBeLessThanOrEqual(PAGE_TEXT_MAX);
      expect(result.text).not.toMatch(/[]/);
      expect(Object.keys(result.stepImages ?? {})).toEqual(refs);
    }
    expect(seen).toEqual(new Set([39, 40]));
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
