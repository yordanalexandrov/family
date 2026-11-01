import {
  displaySourceUrl,
  type ImportPayload,
  type Ingredient,
  type SuggestionPayload,
} from '@family/shared';
import { preparationToValues } from '../preparation/preparation-values';
import {
  emptyIngredientRow,
  emptyRecipeFormValues,
  nutritionToValues,
  type RecipeFormValues,
} from '../recipes/recipe-form-values';

/**
 * Началните стойности на `RecipeForm` от предложение. `resolved` е продуктът от регистъра по име на реда
 * (точно съвпадение); ред без него остава неразрешен и откроен като нов продукт. Подготовката идва във формата, за да
 * се поправи.
 */
export function suggestionToFormValues(
  suggestion: SuggestionPayload,
  resolved: ReadonlyMap<string, Ingredient>,
): RecipeFormValues {
  return {
    ...emptyRecipeFormValues(),
    title: suggestion.title,
    servings: String(suggestion.servings),
    prepMinutes: String(suggestion.prepMinutes),
    sourceUrl: displaySourceUrl(suggestion.sourceUrl),
    tags: [...suggestion.tags],
    appliance: suggestion.appliance ?? '',
    steps: suggestion.steps.map((step) => ({ ...step })),
    preparation: preparationToValues(suggestion.preparation),
    ingredients: suggestion.ingredients.map((line) => {
      const ingredient = line.isNew ? undefined : resolved.get(line.name);
      return emptyIngredientRow({
        ingredient: ingredient ?? null,
        query: ingredient?.name ?? line.name,
        quantity: line.quantity === null ? '' : String(line.quantity),
        unit: line.unit,
        ...(ingredient ? {} : { isNew: true }),
      });
    }),
    nutrition: nutritionToValues(suggestion.nutritionPer100g),
  };
}

/**
 * Началните стойности на `RecipeForm` от внасяне. Редът с `ingredientId` идва свързан с продукта от `linked`
 * (регистъра); редът с `newProduct` остава неразрешен, с предложеното име и форма „Нов продукт“, попълнена от него.
 * Бележката на реда (оригиналната единица) остава в рецептата, а подготовката идва във формата, за да се поправи.
 */
export function importToFormValues(
  recipe: ImportPayload,
  linked: readonly Ingredient[],
  sourceUrl: string | undefined,
): RecipeFormValues {
  const byId = new Map(linked.map((ingredient) => [ingredient.id, ingredient]));
  return {
    ...emptyRecipeFormValues(),
    title: recipe.title,
    servings: String(recipe.servings),
    prepMinutes: recipe.prepMinutes === null ? '' : String(recipe.prepMinutes),
    sourceUrl: displaySourceUrl(sourceUrl ?? ''),
    tags: [...recipe.tags],
    steps: recipe.steps.map((step) => ({ ...step })),
    preparation: preparationToValues(recipe.preparation),
    ingredients: recipe.ingredients.map((line) => {
      const ingredient =
        line.ingredientId === null ? undefined : byId.get(line.ingredientId);
      return emptyIngredientRow({
        ingredient: ingredient ?? null,
        query: ingredient?.name ?? line.newProduct?.name ?? '',
        quantity: line.quantity === null ? '' : String(line.quantity),
        unit: line.unit,
        ...(line.note === null ? {} : { note: line.note }),
        ...(line.newProduct
          ? { isNew: true, newProduct: line.newProduct }
          : {}),
      });
    }),
    nutrition: nutritionToValues(recipe.nutritionPer100g),
  };
}
