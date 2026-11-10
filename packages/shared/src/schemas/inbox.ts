import { z } from 'zod';
import { instantSchema } from './dates.js';
import { appPathSchema, notificationKindSchema } from './notifications.js';

/**
 * A notification in the inbox (GLOSSARY: Входяща кутия) of the acting user, as `GET /api/inbox` gives it: what the push
 * said (`title`, `body`) and where it leads (`url`). One per person and `tag`: a notification with the same tag updates
 * it, moves it to the top (`updatedAt`) and makes it unread again.
 */
export const inboxItemSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  title: z.string().min(1),
  body: z.string(),
  url: appPathSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
  unread: z.boolean(),
});

export type InboxItem = z.infer<typeof inboxItemSchema>;

/** `GET /api/inbox`: the acting user's notifications of the last 30 days, the last updated first. */
export const inboxResponseSchema = z.object({
  items: z.array(inboxItemSchema),
});

export type InboxResponse = z.infer<typeof inboxResponseSchema>;

/** `GET /api/inbox/unread-count`: how many of the acting user's notifications are unread (the bell, the app icon). */
export const inboxUnreadCountSchema = z.object({
  unread: z.number().int().nonnegative(),
});

export type InboxUnreadCount = z.infer<typeof inboxUnreadCountSchema>;
