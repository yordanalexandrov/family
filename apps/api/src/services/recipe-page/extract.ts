import { type DefaultTreeAdapterTypes, parse, parseFragment } from 'parse5';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

/** The most of a page's text the agent gets (title included) when the page has no JSON-LD Recipe. */
export const PAGE_TEXT_MAX = 12_000;

/** How much of the page before „Продукти“ / „Ingredients“ the window keeps (the title and intro of the recipe). */
const BEFORE_INGREDIENTS = 1_000;

/** What a page gives the agent: the JSON-LD Recipe (trimmed to its fields) or, without one, the main text. */
export type ExtractedRecipe =
  | { jsonLd: Record<string, unknown>; text?: undefined }
  | { text: string; jsonLd?: undefined };

/** The fields of a schema.org Recipe the agent needs; images, video, ratings, reviews and authors are left out. */
const RECIPE_FIELDS = [
  'name',
  'description',
  'recipeYield',
  'prepTime',
  'cookTime',
  'totalTime',
  'recipeCategory',
  'recipeCuisine',
  'keywords',
  'suitableForDiet',
  'recipeIngredient',
  // The old name of `recipeIngredient`, still on some sites.
  'ingredients',
  'recipeInstructions',
  'nutrition',
] as const;

/** Elements whose content is never the recipe. */
const SKIPPED = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'select',
]);

/** Elements that break the text into lines. */
const BLOCKS = new Set([
  'address',
  'article',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
]);

/** Where the products start in the text of a recipe, in the languages the family reads. */
const INGREDIENTS_HEADING =
  /необходими продукти|продукти|съставки|ingredients|zutaten|ingrédients|ingredienti/i;

/**
 * The recipe of a fetched page, deterministically: the schema.org `Recipe` of its JSON-LD (also in `@graph`, in a
 * top-level array, with `@type` an array and instructions in `HowToSection`s), trimmed to the recipe's fields; without
 * one, the page's main text without scripts, styles, navigation, header, footer and sidebars, cut to
 * {@link PAGE_TEXT_MAX} around „Продукти“ / „Ingredients“. The lines of products are left as the page writes them.
 */
export function extractRecipe(html: string): ExtractedRecipe {
  const document = parse(html);
  const recipe = findJsonLdRecipe(document);
  if (recipe) {
    return { jsonLd: recipe };
  }
  return { text: pageText(document) };
}

// ── JSON-LD ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecipe(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === 'string' && /(^|[/:])Recipe$/.test(t.trim()),
  );
}

/** The first Recipe node in a JSON-LD value: the value itself, an item of an array, of `@graph` or `mainEntity`. */
function findRecipeNode(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (isRecipe(value)) {
    return value;
  }
  return findRecipeNode(value['@graph']) ?? findRecipeNode(value.mainEntity);
}

function findJsonLdRecipe(document: Node): Record<string, unknown> | undefined {
  for (const script of elements(document, isJsonLdScript)) {
    const value = parseJsonLd(textOf(script));
    const node = findRecipeNode(value);
    if (node && (node.recipeIngredient || node.ingredients)) {
      return trimRecipe(node);
    }
  }
  return undefined;
}

/**
 * A JSON-LD block, also one with raw line breaks or tabs inside its strings (some CMSs write them); `undefined` for a
 * block that is broken otherwise (a theme's bug next to the good one).
 */
function parseJsonLd(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    try {
      // Outside strings a control character is whitespace anyway, so a space keeps the JSON the same.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: replacing exactly those
      return JSON.parse(source.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return undefined;
    }
  }
}

function isJsonLdScript(element: Element): boolean {
  return (
    element.tagName === 'script' &&
    attribute(element, 'type')?.trim().toLowerCase() === 'application/ld+json'
  );
}

/** The Recipe's own fields, cleaned: no `@`-keys, strings without HTML or entities, steps as text or sections. */
function trimRecipe(node: Record<string, unknown>): Record<string, unknown> {
  const recipe: Record<string, unknown> = { '@type': 'Recipe' };
  for (const field of RECIPE_FIELDS) {
    const value = node[field];
    if (value === undefined || value === null) {
      continue;
    }
    recipe[field] =
      field === 'recipeInstructions' ? instructions(value) : clean(value);
  }
  return recipe;
}

function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  if (Array.isArray(value)) {
    return value.map(clean);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith('@'))
        .map(([key, item]) => [key, clean(item)]),
    );
  }
  return value;
}

/** A string of JSON-LD as plain text: HTML tags dropped, entities decoded, whitespace collapsed. */
function cleanText(value: string): string {
  const text = /[<&]/.test(value) ? textOf(parseFragment(value)) : value;
  return text.replace(/\s+/g, ' ').trim();
}

type Instruction = string | { section: string; steps: string[] };

/** `recipeInstructions` in any of its shapes as steps of text, with `HowToSection`s kept as named groups. */
function instructions(value: unknown): Instruction | Instruction[] {
  if (typeof value === 'string') {
    return cleanText(value);
  }
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item): Instruction[] => {
    if (typeof item === 'string') {
      return [cleanText(item)];
    }
    if (!isRecord(item)) {
      return [];
    }
    if (item.itemListElement !== undefined) {
      const steps = sectionSteps(item.itemListElement);
      const name = typeof item.name === 'string' ? cleanText(item.name) : '';
      return name ? [{ section: name, steps }] : steps;
    }
    const text = stepText(item);
    return text ? [text] : [];
  });
}

/** The steps of a section, flat. */
function sectionSteps(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) => {
    if (typeof item === 'string') {
      return [cleanText(item)];
    }
    if (!isRecord(item)) {
      return [];
    }
    if (item.itemListElement !== undefined) {
      return sectionSteps(item.itemListElement);
    }
    const text = stepText(item);
    return text ? [text] : [];
  });
}

function stepText(step: Record<string, unknown>): string | undefined {
  const text = typeof step.text === 'string' ? step.text : step.name;
  return typeof text === 'string' ? cleanText(text) || undefined : undefined;
}

// ── Text ────────────────────────────────────────────────────────────────

/** The page's title, then its main text (the first sizeable `<article>`, else `<main>`, else `<body>`), windowed. */
function pageText(document: Node): string {
  const title = cleanText(
    textOf(first(document, (e) => e.tagName === 'title') ?? emptyNode()),
  );
  return windowed(title, readableText(mainElement(document)));
}

function mainElement(document: Node): Node {
  const article = first(document, (e) => e.tagName === 'article');
  if (article && readableText(article).length >= 300) {
    return article;
  }
  return (
    first(document, (e) => e.tagName === 'main') ??
    first(document, (e) => e.tagName === 'body') ??
    document
  );
}

/** `title` and as much of `body` as fits in {@link PAGE_TEXT_MAX}, from a little before the products on. */
function windowed(title: string, body: string): string {
  const budget = PAGE_TEXT_MAX - title.length - 1;
  let start = 0;
  if (body.length > budget) {
    const heading = INGREDIENTS_HEADING.exec(body);
    if (heading) {
      const from = Math.max(0, heading.index - BEFORE_INGREDIENTS);
      // From the start of a line, so the window does not open mid-sentence.
      start = from === 0 ? 0 : body.indexOf('\n', from) + 1 || from;
      if (start > heading.index) {
        start = heading.index;
      }
    }
  }
  const text = body.slice(start, start + budget).trim();
  return title ? `${title}\n${text}` : text;
}

/** The text a reader sees: skipped elements out, blocks on their own lines, whitespace collapsed, no empty lines. */
function readableText(root: Node): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeName === '#text') {
      parts.push((node as DefaultTreeAdapterTypes.TextNode).value);
      return;
    }
    if (!('childNodes' in node)) {
      return;
    }
    const tag = 'tagName' in node ? node.tagName : '';
    if (SKIPPED.has(tag)) {
      return;
    }
    const block = BLOCKS.has(tag);
    if (block) {
      parts.push('\n');
    }
    for (const child of node.childNodes) {
      walk(child);
    }
    if (block) {
      parts.push('\n');
    }
  };
  walk(root);
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

// ── Tree helpers ────────────────────────────────────────────────────────

function emptyNode(): Node {
  return parseFragment('');
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value;
}

/** Every element under `node` (document order) that matches. */
function elements(node: Node, match: (element: Element) => boolean): Element[] {
  const found: Element[] = [];
  const walk = (current: Node): void => {
    if ('tagName' in current && match(current)) {
      found.push(current);
    }
    if ('childNodes' in current) {
      for (const child of current.childNodes) {
        walk(child);
      }
    }
  };
  walk(node);
  return found;
}

function first(
  node: Node,
  match: (element: Element) => boolean,
): Element | undefined {
  return elements(node, match)[0];
}

/** All the text under `node`, as is. */
function textOf(node: Node): string {
  if (node.nodeName === '#text') {
    return (node as DefaultTreeAdapterTypes.TextNode).value;
  }
  if (!('childNodes' in node)) {
    return '';
  }
  return node.childNodes.map(textOf).join('');
}

// ── Charset ─────────────────────────────────────────────────────────────

/** The charset a `Content-Type` value names, if any. */
function charsetOf(contentType: string | undefined): string | undefined {
  return /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1];
}

/**
 * The page's bytes as text, in the charset the `Content-Type` header names, else the one in `<meta charset>` or
 * `<meta http-equiv="Content-Type">` near the top, else UTF-8 (windows-1251 too: some Bulgarian sites still use it).
 */
export function decodeHtml(
  bytes: Uint8Array,
  contentType: string | undefined,
): string {
  const head = Buffer.from(bytes.subarray(0, 4096)).toString('latin1');
  const meta =
    /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] ?? undefined;
  for (const label of [charsetOf(contentType), meta]) {
    if (label) {
      try {
        return new TextDecoder(label).decode(bytes);
      } catch {
        // An unknown label: try the next source.
      }
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}
