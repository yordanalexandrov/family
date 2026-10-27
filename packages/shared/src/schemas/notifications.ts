import { z } from 'zod';

/**
 * The kinds of notification (GLOSSARY: Известие) a person turns off for themselves: `thaw` = Извади месото,
 * `cook` = Кой готви довечера, `menu` = Известие от Съгласуването (the gathered one and a new menu proposal).
 */
export const notificationKindSchema = z.enum(['thaw', 'cook', 'menu']);

export type NotificationKind = z.infer<typeof notificationKindSchema>;

/**
 * `PUT /api/notifications/subscription`: a device's subscription as `PushSubscription.toJSON()` gives it. Anything else
 * in it (e.g. `expirationTime`) is dropped.
 */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

/** `DELETE /api/notifications/subscription`: the device that turned notifications off. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});

export type PushUnsubscribe = z.infer<typeof pushUnsubscribeSchema>;

/** A person's notification kinds, each on or off; they apply to all of the person's devices. */
export const notificationSettingsSchema = z.record(
  notificationKindSchema,
  z.boolean(),
);

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

/** `GET` and `PUT /api/notifications/settings`; the `PUT` body names every kind too. */
export const notificationSettingsBodySchema = z.object({
  settings: notificationSettingsSchema,
});

export type NotificationSettingsBody = z.infer<
  typeof notificationSettingsBodySchema
>;

/** `GET /api/notifications/vapid-key`: the application server key for `pushManager.subscribe()`. */
export const vapidKeyResponseSchema = z.object({ publicKey: z.string() });

export type VapidKeyResponse = z.infer<typeof vapidKeyResponseSchema>;

/** 404 of the notification routes: the api has no VAPID keys, so nothing can be sent. */
export const pushDisabledSchema = z.object({
  error: z.literal('not_found'),
  code: z.literal('push_disabled'),
  message: z.string(),
});

export type PushDisabled = z.infer<typeof pushDisabledSchema>;

/** `POST /api/notifications/test`: how many of the person's devices the push service took the notification for. */
export const pushTestResponseSchema = z.object({
  sent: z.number().int().nonnegative(),
});

export type PushTestResponse = z.infer<typeof pushTestResponseSchema>;

/** The kind of a push message: a notification kind, or `test` („Пробно известие“), which no setting turns off. */
export const pushKindSchema = z.enum([
  ...notificationKindSchema.options,
  'test',
]);

export type PushKind = z.infer<typeof pushKindSchema>;

/** A path inside the app (`/menu`), never another origin. */
const appPath = z.string().regex(/^\/(?!\/)/, 'must be a path of the app');

/**
 * What the service worker gets in a push message. `tag` replaces the earlier notification with the same tag; `url` is
 * opened on a tap (and when a button fails). A button's `post` is an api path the service worker calls with
 * `x-acting-user: <userId>`, the person the notification is for.
 */
export const pushPayloadSchema = z.object({
  kind: pushKindSchema,
  title: z.string().min(1),
  body: z.string(),
  tag: z.string().min(1),
  url: appPath,
  userId: z.uuid(),
  actions: z
    .array(
      z.object({
        action: z.string().min(1),
        title: z.string().min(1),
        post: z.string().regex(/^\/api\//, 'must be an api path'),
      }),
    )
    .optional(),
});

export type PushPayload = z.infer<typeof pushPayloadSchema>;
