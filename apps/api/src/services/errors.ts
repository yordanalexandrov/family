/**
 * Typed refusals of services, free of HTTP: the error handler (`plugins/error-handler.ts`) maps each class to a status
 * and code. `message` reaches the screen, so it is written in Bulgarian.
 */

/** 404 `not_found`: the record asked for does not exist. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** 409 `conflict`: the record clashes with an existing one; `details` go into the body (e.g. `{ ingredient }`). */
export class ConflictError extends Error {
  readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ConflictError';
    this.details = details;
  }
}

/** 400 `invalid_reference`: the input points at a record that does not exist. */
export class InvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReferenceError';
  }
}

/** 503 `openclaw_unavailable`: the OpenClaw client is disabled (no gateway password), so the AI cannot be asked. */
export class OpenClawUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenClawUnavailableError';
  }
}
