import type { ContractFailure } from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import { failureCode, type OpenClawClient } from '../openclaw/client.js';

/** The client and the agent that answers one AI contract (`OPENCLAW_RECIPE_AGENT`, `OPENCLAW_MENU_AGENT`). */
export interface OpenClawAgent {
  client: OpenClawClient;
  agent: string;
}

/** A `pending` request older than this cannot still be running (one api instance, 180 s timeout) after a restart. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * The cutoff for failing `pending` requests as `stale` at start. `created_at` is the database's real time, so this
 * is not the app's clock (which specs fix).
 */
export function staleCutoff(): Date {
  return new Date(Date.now() - STALE_AFTER_MS);
}

export interface ContractRun {
  /** The contract, for the log: `recipe.suggest`, `menu.propose`. */
  contract: string;
  /** Identifies the stored request in the log, e.g. `{ proposalId }`. */
  logContext: Record<string, string>;
  /** Calls the agent and stores the result; aborted through `signal` when the app closes. */
  run(signal: AbortSignal): Promise<void>;
  /** Stores the request as `failed` with the code of what `run` threw. */
  fail(code: ContractFailure): Promise<void>;
}

export interface ContractRuns {
  /** Starts the run after the current request has answered; it records its own failure, never rejects. */
  start(run: ContractRun): void;
  /** Aborts the runs still going (they end `failed`/`aborted`) and waits for them, before the pool closes. */
  close(): Promise<void>;
}

/**
 * The AI contracts run in the background of the api process (docs/architecture.md): `POST` stores a `pending` request
 * and answers 202, the run stores `done`/`failed`, the client polls. One per service, which keeps its runs in flight.
 */
export function createContractRuns(log: FastifyBaseLogger): ContractRuns {
  const shutdown = new AbortController();
  const running = new Set<Promise<void>>();

  async function execute({
    contract,
    logContext,
    run,
    fail,
  }: ContractRun): Promise<void> {
    try {
      await run(shutdown.signal);
    } catch (error) {
      const code = failureCode(error);
      if (code === 'error') {
        log.error({ err: error, ...logContext }, `${contract} failed`);
      } else {
        log.warn({ ...logContext, error: code }, `${contract} failed`);
      }
      await fail(code).catch((writeError: unknown) =>
        log.error(
          { err: writeError, ...logContext },
          `could not mark the ${contract} run failed`,
        ),
      );
    }
  }

  return {
    start(run) {
      // Not awaited: the client polls. `execute` catches and records its own errors.
      const task = new Promise<void>((resolve) => setImmediate(resolve)).then(
        () => execute(run),
      );
      running.add(task);
      void task.finally(() => running.delete(task));
    },

    async close() {
      shutdown.abort();
      await Promise.all(running);
    },
  };
}
