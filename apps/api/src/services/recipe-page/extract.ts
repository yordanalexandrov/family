import { type DefaultTreeAdapterTypes, parse, parseFragment } from 'parse5';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

/** The most of a page's text the agent gets (title included) when the page has no JSON-LD Recipe. */
export const PAGE_TEXT_MAX = 12_000;

/** How much of the page before „Продукти“ / „Ingredients“ the window keeps (the title and intro of the recipe). */
const BEFORE_INGREDIENTS = 1_000;

/**
 * The most step photos a page gives references to (real pages have up to about 24): the steps after them go as text,
 * so a page cannot make an import download hundreds of pictures.
 */
export const STEP_IMAGES_MAX = 40;

/**
 * The URL of each step photo by the reference that stands in its place (`s1`, `s2`, …): of a `HowToStep.image` of a
 * JSON-LD Recipe, in the order of the steps, or of an `<img>` of the page text, in the order of the text. Only the api
 * reads it: the agent gets the references alone.
 */
export type StepImages = Record<string, string>;

/**
 * What a page gives the agent: the JSON-LD Recipe (trimmed to its fields, a `HowToStep.image` as a reference) or,
 * without one, the main text (a photo as the marker `[снимка s1]` in its place), with the URLs of those references.
 */
export type ExtractedRecipe =
  | {
      jsonLd: Record<string, unknown>;
      stepImages: StepImages;
      text?: undefined;
    }
  | { text: string; stepImages: StepImages; jsonLd?: undefined };

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
 * A step with a `HowToStep.image` (the first of several; a URL relative to `pageUrl` too, `http(s)` only) becomes
 * `{ text, image: 's1' }` and its URL goes to `stepImages`, never into the JSON-LD; past {@link STEP_IMAGES_MAX} photos
 * a step stays text. In the main text an `<img>` becomes the marker `[снимка s1]` in its place, the same way (see
 * {@link pageText}).
 */
export function extractRecipe(html: string, pageUrl?: string): ExtractedRecipe {
  const document = parse(html);
  const stepImages: StepImages = {};
  const recipe = findJsonLdRecipe(
    document,
    (url) => {
      const count = Object.keys(stepImages).length;
      if (count === STEP_IMAGES_MAX) {
        return undefined;
      }
      const ref = `s${count + 1}`;
      stepImages[ref] = url;
      return ref;
    },
    pageUrl,
  );
  if (recipe) {
    return { jsonLd: recipe, stepImages };
  }
  return pageText(document, pageUrl);
}

/** Gives the URL of a step photo its reference, or none past {@link STEP_IMAGES_MAX}. */
type ImageRefs = (url: string) => string | undefined;

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

function findJsonLdRecipe(
  document: Node,
  refs: ImageRefs,
  pageUrl: string | undefined,
): Record<string, unknown> | undefined {
  for (const script of elements(document, isJsonLdScript)) {
    const value = parseJsonLd(textOf(script));
    const node = findRecipeNode(value);
    if (node && (node.recipeIngredient || node.ingredients)) {
      return trimRecipe(node, { refs, pageUrl });
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
function trimRecipe(
  node: Record<string, unknown>,
  images: StepImageContext,
): Record<string, unknown> {
  const recipe: Record<string, unknown> = { '@type': 'Recipe' };
  for (const field of RECIPE_FIELDS) {
    const value = node[field];
    if (value === undefined || value === null) {
      continue;
    }
    recipe[field] =
      field === 'recipeInstructions'
        ? instructions(value, images)
        : clean(value);
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

/** How the steps' photos are referenced: the references so far, and the page's URL for relative ones. */
interface StepImageContext {
  refs: ImageRefs;
  pageUrl: string | undefined;
}

/** A step as the agent reads it: its text, or its text and the reference of its photo. */
type Step = string | { text: string; image: string };

type Instruction = Step | { section: string; steps: Step[] };

/**
 * `recipeInstructions` in any of its shapes as steps of text (with the reference of a step's photo), with
 * `HowToSection`s kept as named groups.
 */
function instructions(
  value: unknown,
  images: StepImageContext,
): Instruction | Instruction[] {
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
      const steps = sectionSteps(item.itemListElement, images);
      const name = typeof item.name === 'string' ? cleanText(item.name) : '';
      return name ? [{ section: name, steps }] : steps;
    }
    const step = howToStep(item, images);
    return step ? [step] : [];
  });
}

/** The steps of a section, flat. */
function sectionSteps(value: unknown, images: StepImageContext): Step[] {
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item): Step[] => {
    if (typeof item === 'string') {
      return [cleanText(item)];
    }
    if (!isRecord(item)) {
      return [];
    }
    if (item.itemListElement !== undefined) {
      return sectionSteps(item.itemListElement, images);
    }
    const step = howToStep(item, images);
    return step ? [step] : [];
  });
}

/** A `HowToStep`: its text, with the reference of its photo when it has one. */
function howToStep(
  step: Record<string, unknown>,
  images: StepImageContext,
): Step | undefined {
  const value = typeof step.text === 'string' ? step.text : step.name;
  const text = typeof value === 'string' ? cleanText(value) : '';
  if (!text) {
    return undefined;
  }
  const url = imageUrl(step.image, images.pageUrl);
  const image = url && images.refs(url);
  return image ? { text, image } : text;
}

/**
 * The URL of a `HowToStep.image`: a URL, an `ImageObject` (`url` or `contentUrl`), or the first usable of an array of
 * them; absolute against the page, `http(s)` only (no `data:`).
 */
function imageUrl(
  value: unknown,
  pageUrl: string | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = imageUrl(item, pageUrl);
      if (url) {
        return url;
      }
    }
    return undefined;
  }
  if (isRecord(value)) {
    return imageUrl(value.url, pageUrl) ?? imageUrl(value.contentUrl, pageUrl);
  }
  return typeof value === 'string' ? webUrl(value, pageUrl) : undefined;
}

/** `value` as an absolute URL against the page, `http(s)` only (no `data:`). */
function webUrl(
  value: string,
  pageUrl: string | undefined,
): string | undefined {
  if (value.trim() === '') {
    return undefined;
  }
  try {
    const url = new URL(value.trim(), pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

// ── Text ────────────────────────────────────────────────────────────────

/** The main text of a page without a JSON-LD Recipe, with the URLs of the references of its photo markers. */
type PageText = { text: string; stepImages: StepImages };

/**
 * The page's title, then its main text (the first sizeable `<article>`, else `<main>`, else `<body>`), windowed, with
 * each photo of it as a marker `[снимка s1]` in its place. Only a photo whose marker the window keeps gets a
 * reference, once per URL and at most {@link STEP_IMAGES_MAX}: the agent gets no reference it does not see.
 */
function pageText(document: Node, pageUrl: string | undefined): PageText {
  const title = cleanText(
    textOf(first(document, (e) => e.tagName === 'title') ?? emptyNode()),
  );
  const photos: string[] = [];
  const body = readableText(mainElement(document), (img) => {
    const url = photoUrl(img, pageUrl);
    if (!url) {
      return '';
    }
    photos.push(url);
    return ` ${placeholder(photos.length - 1)} `;
  });
  return numberedPhotos(windowed(title, body), photos);
}

/** The longest marker; a placeholder is as long, so the markers keep the text in {@link PAGE_TEXT_MAX}. */
const LONGEST_MARKER = `[снимка s${STEP_IMAGES_MAX}]`.length;

/** Where a photo stands in the text until the window is cut: its index among the photos, between two private characters. */
function placeholder(index: number): string {
  return `\uE000${String(index).padStart(LONGEST_MARKER - 2, '0')}\uE001`;
}

const PLACEHOLDER = /\uE000(\d+)\uE001/g;

/** The windowed text with its placeholders as markers `[снимка sN]`, numbered in order, and their URLs. */
function numberedPhotos(text: string, photos: string[]): PageText {
  const stepImages: StepImages = {};
  const refs = new Set<string>();
  const numbered = text
    // A placeholder the window cut in half.
    .replace(/\uE000\d*$/, '')
    .replace(PLACEHOLDER, (_, index: string) => {
      const url = photos[Number(index)] as string;
      const count = refs.size;
      if (refs.has(url) || count === STEP_IMAGES_MAX) {
        return '';
      }
      refs.add(url);
      stepImages[`s${count + 1}`] = url;
      return `[снимка s${count + 1}]`;
    });
  return { text: tidyLines(numbered), stepImages };
}

/**
 * The URL of a photo of the page text: the largest of its `srcset` (also lazy-loaded), else its lazy-loaded `src`,
 * else its `src`; absolute against the page, `http(s)` only. None for an icon, an avatar, a logo, rating stars or a
 * tracking pixel: smaller than {@link PHOTO_MIN_SIZE} pixels in its attributes, hidden from screen readers, or named
 * so in its class or address.
 */
function photoUrl(
  img: Element,
  pageUrl: string | undefined,
): string | undefined {
  if (
    [attribute(img, 'width'), attribute(img, 'height')].some(
      (size) => pixels(size) < PHOTO_MIN_SIZE,
    ) ||
    attribute(img, 'aria-hidden') === 'true' ||
    attribute(img, 'role') === 'presentation' ||
    NOT_A_PHOTO_CLASS.test(attribute(img, 'class') ?? '')
  ) {
    return undefined;
  }
  const url =
    largestOfSrcset(
      attribute(img, 'data-lazy-srcset') ??
        attribute(img, 'data-srcset') ??
        attribute(img, 'srcset'),
      pageUrl,
    ) ??
    [
      attribute(img, 'data-lazy-src'),
      attribute(img, 'data-src'),
      attribute(img, 'src'),
    ]
      .map((candidate) => candidate && webUrl(candidate, pageUrl))
      .find((candidate) => candidate !== undefined);
  return url && !isNotAPhotoAddress(url) ? url : undefined;
}

/** Smaller than this many pixels in `width` or `height` is an icon, an avatar or a pixel, not a photo of a step. */
const PHOTO_MIN_SIZE = 100;

/** A size attribute in pixels (`48`, `48px`); none for a percentage or no attribute. */
function pixels(size: string | undefined): number {
  const match = /^\s*(\d+)(px)?\s*$/i.exec(size ?? '');
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/** A class of a picture that is not a photo of the recipe. */
const NOT_A_PHOTO_CLASS =
  /(^|[^a-z])(avatars?|gravatar|emoji|icons?|logo|spinner|loader|sprite|pixel|spacer|rating|stars?)([^a-z]|$)/i;

/**
 * A folder or a file name (without its extension) of a picture that is not a photo: `/avatar/…`, `/Smileys/…`,
 * `logo.png`, `1star.png`.
 */
const NOT_A_PHOTO_NAME =
  /^\d*(avatars?|gravatar|emojis?|emoticons?|smileys?|smilies|icons?|logo|spinner|loader|sprite|pixel|spacer|rating|stars?)[\d_-]*$/i;

function isNotAPhotoAddress(url: string): boolean {
  const { hostname, pathname } = new URL(url);
  return (
    /(^|\.)gravatar\.com$/.test(hostname) ||
    pathname
      .split('/')
      .some((part) => NOT_A_PHOTO_NAME.test(part.replace(/\.[^.]*$/, '')))
  );
}

/**
 * The URL of the widest usable candidate of a `srcset` (`640w`, or `2x`). Candidates are split at a comma after a
 * descriptor or before whitespace, so a URL with commas in it (`w_640,h_480`) and a `data:` placeholder stay whole.
 */
function largestOfSrcset(
  srcset: string | undefined,
  pageUrl: string | undefined,
): string | undefined {
  let largest: { url: string; size: number } | undefined;
  for (const candidate of (srcset ?? '').split(
    /(?<=\s\d+(?:\.\d+)?[wx])\s*,|,\s+/,
  )) {
    const [value, descriptor] = candidate.trim().split(/\s+/);
    const url = value && webUrl(value, pageUrl);
    if (!url) {
      continue;
    }
    const size = Number.parseFloat(descriptor ?? '1') || 1;
    if (!largest || size > largest.size) {
      largest = { url, size };
    }
  }
  return largest?.url;
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

/**
 * The text a reader sees: skipped elements out, blocks on their own lines, whitespace collapsed, no empty lines; an
 * `<img>` as what `photo` writes in its place, if given.
 */
function readableText(root: Node, photo?: (img: Element) => string): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeName === '#text') {
      parts.push((node as DefaultTreeAdapterTypes.TextNode).value);
      return;
    }
    if (photo && 'tagName' in node && node.tagName === 'img') {
      parts.push(photo(node));
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
  return tidyLines(parts.join(''));
}

/** Whitespace collapsed in each line, no empty lines. */
function tidyLines(text: string): string {
  return text
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
