import { z } from 'zod';

/**
 * Why an AI request (GLOSSARY: AI заявка) ended `failed` (its `error`): `timeout`, `invalid_output` (two invalid
 * answers), `http_<status>` (the gateway answered an error), `aborted` (the api shut down), `stale` (cut off by a
 * restart) or `error` (a bug). The same codes for every contract.
 */
export const CONTRACT_FAILURES = [
  'timeout',
  'invalid_output',
  'aborted',
  'stale',
  'error',
] as const;

export const contractFailureSchema = z.union([
  z.enum(CONTRACT_FAILURES),
  z.templateLiteral(['http_', z.int()]),
]);

export type ContractFailure = z.infer<typeof contractFailureSchema>;
