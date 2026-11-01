-- #281: the preparation of a recipe (GLOSSARY: Подготовка); recipes from before it get an empty one.
ALTER TABLE "recipe" ADD COLUMN "preparation" jsonb DEFAULT '[]'::jsonb NOT NULL;