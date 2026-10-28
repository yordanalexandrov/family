import { z } from 'zod';

/**
 * Why an AI request (GLOSSARY: AI заявка) ended `failed` (its `error`): `timeout`, `invalid_output` (two invalid
 * answers), `no_results` (the agent found nothing and said why), `http_<status>` (the gateway answered an error),
 * `aborted` (the api shut down), `stale` (cut off by a restart) or `error` (a bug). The same codes for every contract;
 * `fetch_blocked` (the site refuses an automated read: 403, 406, 429 or a bot check) and `fetch_failed` (network error,
 * timeout, over 2 MB, not HTML, too many redirects, a private address) only for an import by link, before any agent call.
 */
export const CONTRACT_FAILURES = [
  'timeout',
  'invalid_output',
  'no_results',
  'aborted',
  'stale',
  'error',
  'fetch_blocked',
  'fetch_failed',
] as const;

export const contractFailureSchema = z.union([
  z.enum(CONTRACT_FAILURES),
  z.templateLiteral(['http_', z.int()]),
]);

export type ContractFailure = z.infer<typeof contractFailureSchema>;
