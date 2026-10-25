-- Data migration: the two family members. Fixed UUIDs; `color` names a design token defined in apps/web.
INSERT INTO "user" ("id", "name", "role", "initial", "color")
VALUES ('11111111-1111-4111-8111-111111111111', 'Дани', 'parent', 'Д', 'person-1')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "user" ("id", "name", "role", "initial", "color")
VALUES ('22222222-2222-4222-8222-222222222222', 'Поли', 'parent', 'П', 'person-2')
ON CONFLICT DO NOTHING;
