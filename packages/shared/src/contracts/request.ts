import { z } from 'zod';

/**
 * Where an AI request (GLOSSARY: AI заявка) is: `pending` while the agent works, then `done` or `failed` (with a
 * `ContractFailure` code). The same for every contract.
 */
export const contractRequestStatusSchema = z.enum([
  'pending',
  'done',
  'failed',
]);

export type ContractRequestStatus = z.infer<typeof contractRequestStatusSchema>;
