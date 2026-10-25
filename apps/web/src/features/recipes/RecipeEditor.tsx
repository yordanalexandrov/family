import type { RecipeInput } from '@family/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ErrorBox } from '../../components/ErrorBox';
import { Spinner } from '../../components/Spinner';
import { useRecipe, useSaveRecipe } from './queries';
import { RecipeForm } from './RecipeForm';
import { recipeToFormValues } from './recipe-form-values';
import './recipes.css';

/** Запис и после към прегледа на рецептата. */
function useSaveAndView(id?: string) {
  const save = useSaveRecipe();
  const navigate = useNavigate();
  return {
    save,
    submit(input: RecipeInput) {
      save.mutate(
        { ...(id ? { id } : {}), input },
        {
          onSuccess(recipe) {
            void navigate({ to: '/recipes/$id', params: { id: recipe.id } });
          },
        },
      );
    },
  };
}

export function NewRecipeScreen() {
  const { save, submit } = useSaveAndView();
  const navigate = useNavigate();
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link to="/recipes" className="recipes__back recipes__back--block">
          ← Рецепти
        </Link>
        <h1 className="recipes__title">Нова рецепта</h1>
      </header>
      <RecipeForm
        onSubmit={submit}
        isSubmitting={save.isPending}
        submitError={save.error}
        onCancel={() => void navigate({ to: '/recipes' })}
      />
    </main>
  );
}

export function EditRecipeScreen() {
  const { id } = useParams({ from: '/recipes/$id/edit' });
  const recipe = useRecipe(id);
  const { save, submit } = useSaveAndView(id);
  const navigate = useNavigate();
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link
          to="/recipes/$id"
          params={{ id }}
          className="recipes__back recipes__back--block"
        >
          ← Към рецептата
        </Link>
        <h1 className="recipes__title">Редакция</h1>
      </header>
      {recipe.isPending ? (
        <Spinner />
      ) : recipe.isError ? (
        <ErrorBox error={recipe.error} onRetry={() => void recipe.refetch()} />
      ) : (
        <RecipeForm
          key={recipe.data.id}
          initialValues={recipeToFormValues(recipe.data)}
          onSubmit={submit}
          isSubmitting={save.isPending}
          submitError={save.error}
          onCancel={() => void navigate({ to: '/recipes/$id', params: { id } })}
        />
      )}
    </main>
  );
}
