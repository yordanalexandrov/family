import { z } from 'zod';
import { instantSchema } from './dates.js';
import {
  appPathSchema,
  notificationKindSchema,
  pushActionSchema,
} from './notifications.js';

/**
 * A line of a notification's details (GLOSSARY: Входяща кутия), seen only in the inbox, under „Още“: what it says and,
 * when there is one, the place in the app it leads to.
 */
export const inboxDetailSchema = z.object({
  text: z.string().min(1),
  url: appPathSchema.optional(),
});

export type InboxDetail = z.infer<typeof inboxDetailSchema>;

/**
 * A notification in the inbox (GLOSSARY: Входяща кутия) of the acting user, as `GET /api/inbox` gives it: what the push
 * said (`title`, `body`), where it leads (`url`), its `details`, which the push leaves out (may be none), and its
 * buttons while they make sense. One per person and `tag`: a notification with the same tag updates it (the details
 * too), moves it to the top (`updatedAt`) and makes it unread again.
 */
export const inboxItemSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  title: z.string().min(1),
  body: z.string(),
  url: appPathSchema,
  details: z.array(inboxDetailSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
  unread: z.boolean(),
  /**
   * The buttons of the notification („Извадих“, „Аз“), as in the push, only while they make sense: until the end of
   * the dinner's day and while no one answered.
   */
  actions: z.array(pushActionSchema).optional(),
  /**
   * Who answered the buttons, instead of them (`Поли вече готви`, `Дани извади месото`), from the dinner as it is now;
   * none after the end of the dinner's day.
   */
  answered: z.object({ text: z.string().min(1) }).optional(),
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
