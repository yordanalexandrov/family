import type { AiContract } from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db, DbExecutor } from '../db/client.js';
import {
  type ContractRequestTable,
  failPendingContractRequestsBefore,
  finishContractRequest,
} from '../db/repositories/contract-requests.js';
import { failureCode, type OpenClawClient } from '../openclaw/client.js';
import { OpenClawUnavailableError } from './errors.js';

/** A `pending` request older than this cannot still be running (one api instance, 180 s timeout) after a restart. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/** The stored request of one contract: at least its id; the rest is the contract's own (API model). */
export interface StoredContractRequest {
  id: string;
}

/**
 * What one contract adds to the common lifecycle (GLOSSARY: AI заявка): its table, how a request is stored and read,
 * the contract input built from it, and what a valid answer writes.
 */
export interface ContractRequestStore<
  P,
  R extends StoredContractRequest,
  I,
  O,
> {
  /** Spreads `contractRequestColumns()`; finished and failed as stale by the module. */
  table: ContractRequestTable;
  /**
   * Inserts the `pending` request, in the module's transaction; refuses here (a `ServiceRefusal`) what this contract
   * cannot take, e.g. a week that already has a menu.
   */
  insert(tx: DbExecutor, params: P, requestedBy: string): Promise<R>;
  find(db: DbExecutor, id: string): Promise<R | undefined>;
  /** The contract input for the request, read when the run starts. */
  buildInput(db: DbExecutor, request: R): Promise<I>;
  /** Writes what the valid answer makes, in the transaction that marks the request `done`. */
  onDone(tx: DbExecutor, request: R, output: O): Promise<void>;
  /** After that transaction has committed, e.g. to signal the change (`app.events`). Must not throw. */
  afterDone?(request: R): void;
  /**
   * Why a valid answer has nothing to write, when the agent says so (e.g. `recipe.suggest` found no recipes); the
   * request then ends `failed`/`no_results` without `onDone` or a retry. `null` (or no method) = write the answer.
   */
  noResults?(output: O): string | null;
}

/** The requests of one registered contract, as its service uses them. */
export interface ContractRequestHandle<P, R extends StoredContractRequest> {
  /**
   * Stores a `pending` request and starts the run after the current HTTP request has answered; the request is
   * returned at once and the client polls. 503 `openclaw_unavailable` when OpenClaw is not configured.
   */
  request(params: P, actingUserId: string): Promise<R>;
  get(id: string): Promise<R | undefined>;
}

export interface ContractRequests {
  /** `agent` answers `contract` (`OPENCLAW_RECIPE_AGENT`, `OPENCLAW_MENU_AGENT`: configuration, ADR-0004). */
  register<P, R extends StoredContractRequest, I, O>(
    contract: AiContract<I, O>,
    store: ContractRequestStore<P, R, I, O>,
    agent: string,
  ): ContractRequestHandle<P, R>;
  /**
   * At start: `pending` requests of every registered contract older than 10 minutes were cut off by a restart and
   * become `failed`/`stale`. Logs and never rejects: the api serves without it.
   */
  failStale(): Promise<void>;
  /** Aborts the runs still going (they end `failed`/`aborted`) and waits for them, before the pool closes. */
  close(): Promise<void>;
}

/**
 * The lifecycle of AI requests (docs/architecture.md): `POST` stores a `pending` request and answers 202, the run in
 * the background of the api process calls OpenClaw and stores `done`/`failed`, the client polls. Created once in
 * `buildApp()`; `client: null` (OpenClaw not configured, dev only) refuses every request.
 */
export function createContractRequests({
  db,
  client,
  log,
}: {
  db: Db;
  client: OpenClawClient | null;
  log: Pick<FastifyBaseLogger, 'warn' | 'error'>;
}): ContractRequests {
  const shutdown = new AbortController();
  const running = new Set<Promise<void>>();
  const registered: { id: string; table: ContractRequestTable }[] = [];

  return {
    register<P, R extends StoredContractRequest, I, O>(
      contract: AiContract<I, O>,
      store: ContractRequestStore<P, R, I, O>,
      agent: string,
    ): ContractRequestHandle<P, R> {
      registered.push({ id: contract.id, table: store.table });

      /** Runs one request to its end; records its own failure, never rejects. */
      async function execute(
        gateway: OpenClawClient,
        request: R,
      ): Promise<void> {
        const logContext = { requestId: request.id };
        try {
          const input = await store.buildInput(db, request);
          const output = await gateway.complete(contract, input, {
            agent,
            signal: shutdown.signal,
          });
          const noResults = store.noResults?.(output) ?? null;
          if (noResults !== null) {
            log.warn(
              { ...logContext, noResults },
              `${contract.id} found no results`,
            );
            await finishContractRequest(db, store.table, request.id, {
              status: 'failed',
              error: 'no_results',
            });
            return;
          }
          await db.transaction(async (tx) => {
            await store.onDone(tx, request, output);
            await finishContractRequest(tx, store.table, request.id, {
              status: 'done',
            });
          });
          store.afterDone?.(request);
        } catch (error) {
          const code = failureCode(error);
          if (code === 'error') {
            log.error({ err: error, ...logContext }, `${contract.id} failed`);
          } else {
            log.warn({ ...logContext, error: code }, `${contract.id} failed`);
          }
          await finishContractRequest(db, store.table, request.id, {
            status: 'failed',
            error: code,
          }).catch((writeError: unknown) =>
            log.error(
              { err: writeError, ...logContext },
              `could not mark the ${contract.id} run failed`,
            ),
          );
        }
      }

      return {
        async request(params, actingUserId) {
          const gateway = client;
          if (!gateway) {
            throw new OpenClawUnavailableError(
              'Предложенията не са достъпни: OpenClaw не е настроен',
            );
          }
          const request = await db.transaction((tx) =>
            store.insert(tx, params, actingUserId),
          );
          // Not awaited: the client polls. `execute` catches and records its own errors.
          const task = new Promise<void>((resolve) =>
            setImmediate(resolve),
          ).then(() => execute(gateway, request));
          running.add(task);
          void task.finally(() => running.delete(task));
          return request;
        },

        get(id) {
          return store.find(db, id);
        },
      };
    },

    async failStale() {
      // `created_at` is the database's real time, so this is not the app's clock (which specs fix).
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);
      for (const { id, table } of registered) {
        try {
          const failed = await failPendingContractRequestsBefore(
            db,
            table,
            cutoff,
            'stale',
          );
          if (failed > 0) {
            log.warn({ failed }, `stale ${id} requests marked failed`);
          }
        } catch (error) {
          log.error({ err: error }, `could not fail stale ${id} requests`);
        }
      }
    },

    async close() {
      shutdown.abort();
      await Promise.all(running);
    },
  };
}
