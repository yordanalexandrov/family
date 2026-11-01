import type { ContractRecipe, Recipe } from '@family/shared';

/**
 * The photo of each step of a recipe that has one, by the reference an AI contract gets instead (`recipe.refine`,
 * `recipe.revise`): `e1`, `e2`, … in the order of the steps.
 */
export function photosByRef(recipe: Recipe): Map<string, string> {
  const photos = new Map<string, string>();
  for (const step of recipe.steps) {
    if (step.photoId) {
      photos.set(`e${photos.size + 1}`, step.photoId);
    }
  }
  return photos;
}

/**
 * A recipe of the registry as `recipe.refine` and `recipe.revise` read it: its products by name, its steps' photos by
 * their references in `ownPhotos` ({@link photosByRef}), its preparation.
 */
export function contractRecipe(
  recipe: Recipe,
  ownPhotos: ReadonlyMap<string, string>,
): ContractRecipe {
  const refs = new Map([...ownPhotos].map(([ref, id]) => [id, ref]));
  return {
    title: recipe.title,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes ?? null,
    ingredients: recipe.ingredients.map((line) => ({
      name: line.ingredient.name,
      quantity: line.quantity,
      unit: line.unit,
      ...(line.note === undefined ? {} : { note: line.note }),
    })),
    steps: recipe.steps.map((step) => ({
      text: step.text,
      image: (step.photoId && refs.get(step.photoId)) ?? null,
    })),
    preparation: recipe.preparation,
  };
}
