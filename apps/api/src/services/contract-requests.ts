import type { AiContract, ContractFailure } from '@family/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db, DbExecutor } from '../db/client.js';
import {
  type ContractRequestTable,
  failPendingContractRequestsBefore,
  finishContractRequest,
} from '../db/repositories/contract-requests.js';
import {
  type ContractImage,
  failureCode,
  type OpenClawClient,
} from '../openclaw/client.js';
import { OpenClawUnavailableError } from './errors.js';

/** A `pending` request older than this cannot still be running (one api instance, 180 s timeout) after a restart. */
const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * A run that cannot go on, with the code it ends with; thrown by a store's `buildInput` before the agent is asked
 * (e.g. `fetch_blocked` when the page of an import by link will not open).
 */
export class ContractRequestFailure extends Error {
  readonly code: ContractFailure;

  constructor(code: ContractFailure, message: string) {
    super(message);
    this.name = 'ContractRequestFailure';
    this.code = code;
  }
}

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
  /** Who asks: a user's id, or `null` too for a contract the api also runs by itself (the cron's `menu.propose`). */
  A extends string | null = string,
  /** What {@link ContractRequestStore.prepare} hands `onDone`; none without it. */
  D = undefined,
  /** What {@link ContractRequestStore.load} read for the run; none without it. */
  C = undefined,
> {
  /** Spreads `contractRequestColumns()`; finished and failed as stale by the module. */
  table: ContractRequestTable;
  /**
   * Inserts the `pending` request, in the module's transaction; refuses here (a `ServiceRefusal`) what this contract
   * cannot take, e.g. a week that already has a menu.
   */
  insert(tx: DbExecutor, params: P, requestedBy: A): Promise<R>;
  find(db: DbExecutor, id: string): Promise<R | undefined>;
  /**
   * What the run reads first, when it starts, and keeps in its memory (never in the table) for `buildInput` and
   * `prepare`: e.g. the page of an import by link, whose step photo URLs the agent never gets. Throws
   * {@link ContractRequestFailure} to end the run with its code before the agent is asked. No method = `undefined`.
   */
  load?(db: DbExecutor, request: R): Promise<C>;
  /**
   * The contract input for the request, built when the run starts from what `load` read. Throws
   * {@link ContractRequestFailure} to end the run with its code before the agent is asked.
   */
  buildInput(db: DbExecutor, request: R, loaded: C): Promise<I>;
  /**
   * Pictures that go to the agent next to the input (the photos of an import), taken from the params once the request
   * is stored: they live only in the memory of its run, never in the table. No method = none.
   */
  images?(params: P): ContractImage[];
  /**
   * After a valid answer with results, before the transaction that writes it: work too slow to hold a transaction for
   * (the downloads and decoding of an import's step photos, by what `load` read), aborted with the run (`signal`); its
   * result goes to `onDone`. One that throws fails the run. No method = `onDone` gets `undefined`.
   */
  prepare?(output: O, loaded: C, signal: AbortSignal): Promise<D>;
  /** Writes what the valid answer makes, in the transaction that marks the request `done`. */
  onDone(
    tx: DbExecutor,
    request: R,
    output: O,
    prepared: D | undefined,
  ): Promise<void>;
  /** After that transaction has committed, e.g. to signal the change (`app.events`). One that throws is logged. */
  afterDone?(request: R): void;
  /** After the `pending` request has committed, e.g. to signal that it waits. Must not throw. */
  afterRequest?(request: R): void;
  /** After the request has been marked `failed` (not `stale`), e.g. to signal it. One that throws is logged. */
  afterFailed?(request: R): void;
  /**
   * Why a valid answer has nothing to write, when the agent says so (e.g. `recipe.suggest` found no recipes); the
   * request then ends `failed`/`no_results` without `onDone` or a retry. `null` (or no method) = write the answer.
   */
  noResults?(output: O): string | null;
  /** Keeps the reason of {@link ContractRequestStore.noResults}, in the transaction that marks the request failed. */
  onNoResults?(tx: DbExecutor, request: R, reason: string): Promise<void>;
}

/** The requests of one registered contract, as its service uses them. */
export interface ContractRequestHandle<
  P,
  R extends StoredContractRequest,
  A extends string | null = string,
> {
  /**
   * Stores a `pending` request and starts the run after the current HTTP request has answered; the request is
   * returned at once and the client polls. 503 `openclaw_unavailable` when OpenClaw is not configured.
   */
  request(params: P, actingUserId: A): Promise<R>;
  get(id: string): Promise<R | undefined>;
}

export interface ContractRequests {
  /** `agent` answers `contract` (`OPENCLAW_RECIPE_AGENT`, `OPENCLAW_MENU_AGENT`: configuration, ADR-0004). */
  register<
    P,
    R extends StoredContractRequest,
    I,
    O,
    A extends string | null,
    D = undefined,
    C = undefined,
  >(
    contract: AiContract<I, O>,
    store: ContractRequestStore<P, R, I, O, A, D, C>,
    agent: string,
  ): ContractRequestHandle<P, R, A>;
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
    register<
      P,
      R extends StoredContractRequest,
      I,
      O,
      A extends string | null,
      D = undefined,
      C = undefined,
    >(
      contract: AiContract<I, O>,
      store: ContractRequestStore<P, R, I, O, A, D, C>,
      agent: string,
    ): ContractRequestHandle<P, R, A> {
      registered.push({ id: contract.id, table: store.table });

      /**
       * Calls `afterDone`/`afterFailed`, once the request has ended: one that throws anyway is logged, as a failed write
       * of the failure is, and never changes how the request ended.
       */
      function after(hook: 'afterDone' | 'afterFailed', request: R): void {
        try {
          store[hook]?.(request);
        } catch (error) {
          log.error(
            { err: error, requestId: request.id },
            `${contract.id} ${hook} failed`,
          );
        }
      }

      /** Runs one request to its end; records its own failure, never rejects. */
      async function execute(
        gateway: OpenClawClient,
        request: R,
        images: ContractImage[],
      ): Promise<void> {
        const logContext = { requestId: request.id };
        try {
          // Without `load`, `C` is `undefined`.
          const loaded = (await store.load?.(db, request)) as C;
          const input = await store.buildInput(db, request, loaded);
          const output = await gateway.complete(contract, input, {
            agent,
            signal: shutdown.signal,
            ...(images.length > 0 ? { images } : {}),
          });
          const noResults = store.noResults?.(output) ?? null;
          if (noResults !== null) {
            log.warn(
              { ...logContext, noResults },
              `${contract.id} found no results`,
            );
            await db.transaction(async (tx) => {
              await store.onNoResults?.(tx, request, noResults);
              await finishContractRequest(tx, store.table, request.id, {
                status: 'failed',
                error: 'no_results',
              });
            });
            after('afterFailed', request);
            return;
          }
          const prepared = await store.prepare?.(
            output,
            loaded,
            shutdown.signal,
          );
          await db.transaction(async (tx) => {
            await store.onDone(tx, request, output, prepared);
            await finishContractRequest(tx, store.table, request.id, {
              status: 'done',
            });
          });
          after('afterDone', request);
        } catch (error) {
          const code =
            error instanceof ContractRequestFailure
              ? error.code
              : failureCode(error);
          if (code === 'error') {
            log.error({ err: error, ...logContext }, `${contract.id} failed`);
          } else {
            log.warn(
              {
                ...logContext,
                error: code,
                ...(error instanceof ContractRequestFailure
                  ? { reason: error.message }
                  : {}),
              },
              `${contract.id} failed`,
            );
          }
          await finishContractRequest(db, store.table, request.id, {
            status: 'failed',
            error: code,
          }).then(
            () => after('afterFailed', request),
            (writeError: unknown) =>
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
          store.afterRequest?.(request);
          const images = store.images?.(params) ?? [];
          // Not awaited: the client polls. `execute` catches and records its own errors.
          const task = new Promise<void>((resolve) =>
            setImmediate(resolve),
          ).then(() => execute(gateway, request, images));
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
