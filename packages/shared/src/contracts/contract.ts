import type { ZodType } from 'zod';

/**
 * One AI contract (GLOSSARY: AI контракт) as a single object: what goes in, what must come back for that input, and
 * the JSON Schema the gateway is asked to follow. The OpenClaw client in api takes it whole, so a caller cannot pick
 * the wrong schema variant. The agent that answers it is configuration (ADR-0004), not part of the contract.
 */
export interface AiContract<I, O> {
  /** The contract's name, as in docs and logs: `recipe.suggest`, `menu.propose`. */
  id: string;
  /** The input the API assembles; checked before anything is sent, so a mismatch is a bug in the API. */
  inputSchema: ZodType<I>;
  /**
   * What a valid answer to `input` is: shape and the rules that depend on the input. Every contract takes the input,
   * even when it ignores it, so the client calls them all the same way.
   */
  outputSchema(input: I): ZodType<O>;
  /**
   * `response_format.json_schema` for strict structured outputs: best effort on the gateway's side, so the answer
   * is still parsed with {@link AiContract.outputSchema}.
   */
  responseFormat: { name: string; schema: Record<string, unknown> };
}
