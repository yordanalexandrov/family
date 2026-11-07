-- Data migration: Рецептурко, the service user of Рецептурник (ADR-0014). Fixed UUID, written in docs/concept.md.
INSERT INTO "user" ("id", "name", "role", "initial", "color")
VALUES ('33333333-3333-4333-8333-333333333333', 'Рецептурко', 'app', 'Р', 'person-app')
ON CONFLICT DO NOTHING;
