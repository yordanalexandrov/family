import { z } from 'zod';

/** Longest free-text hint a person adds to an AI request („нещо леко“, „без риба“). */
export const HINT_MAX = 200;

/** The hint of an AI request, trimmed; the same limit for every contract and its form. */
export const hintSchema = z.string().trim().max(HINT_MAX);
