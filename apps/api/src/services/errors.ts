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

/** 403 `forbidden`: the record belongs to someone else (e.g. another user's comment). */
export class ForbiddenError extends ServiceRefusal {}

/** 400 `invalid_reference`: the input points at a record that does not exist. */
export class InvalidReferenceError extends ServiceRefusal {}

/** 503 `openclaw_unavailable`: the OpenClaw client is disabled (dev mode without a gateway password). */
export class OpenClawUnavailableError extends ServiceRefusal {}

/** 400 `invalid_action`: the action does not apply to this kind of record (e.g. hiding a manual shopping item). */
export class InvalidActionError extends ServiceRefusal {}
