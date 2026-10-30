import {
  type Refusal,
  type RefusalCode,
  type RefusalDetails,
  refusalErrorOf,
} from '@family/shared';

/**
 * Typed refusals of services, free of HTTP: the error handler (`plugins/error-handler.ts`) maps each class to a status
 * and code. `message` reaches the screen, so it is written in Bulgarian; `details` go into the body next to it.
 */
export abstract class ServiceRefusal extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

/** 404 `not_found`: the record asked for does not exist. */
export class NotFoundError extends ServiceRefusal {}

/** 409 `conflict`: the record clashes with an existing one; `details` carry it (e.g. `{ ingredient }`). */
export class ConflictError extends ServiceRefusal {}

/** 409 `already_imported`: an import by link of a link already in the registry; `details` name the recipe or suggestion. */
export class AlreadyImportedError extends ServiceRefusal {}

/** 403 `forbidden`: the record belongs to someone else (e.g. another user's comment). */
export class ForbiddenError extends ServiceRefusal {}

/** 400 `invalid_reference`: the input points at a record that does not exist. */
export class InvalidReferenceError extends ServiceRefusal {}

/** 503 `openclaw_unavailable`: the OpenClaw client is disabled (dev mode without a gateway password). */
export class OpenClawUnavailableError extends ServiceRefusal {}

/** 415 `unsupported_photo`: the bytes are not a JPEG, PNG, WebP or HEIC picture, or one that cannot be read. */
export class UnsupportedPhotoError extends ServiceRefusal {}

/** 400 `invalid_action`: the action does not apply to this kind of record (e.g. hiding a manual shopping item). */
export class InvalidActionError extends ServiceRefusal {}

/** The class of each `error` a refusal with a sub-code is answered with. */
const REFUSAL_CLASSES: Record<
  Refusal['error'],
  new (
    message: string,
    details: Record<string, unknown>,
  ) => ServiceRefusal
> = {
  not_found: NotFoundError,
  conflict: ConflictError,
};

/**
 * A refusal with a sub-code from `refusalSchemas` in shared, e.g. `throw refuse('no_plan', 'Няма меню…')`: its class
 * (and so the status) follows the code, and a wrong code or details do not compile. The details are required exactly
 * when the code has any.
 */
export function refuse<C extends RefusalCode>(
  code: C,
  message: string,
  ...[details]: keyof RefusalDetails<C> extends never
    ? []
    : [details: RefusalDetails<C>]
): ServiceRefusal {
  return new REFUSAL_CLASSES[refusalErrorOf(code)](message, {
    code,
    ...details,
  });
}
