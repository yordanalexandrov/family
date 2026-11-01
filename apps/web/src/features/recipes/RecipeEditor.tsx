import type { RecipeInput } from '@family/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorBox } from '../../components/ErrorBox';
import { useNeedsConnection } from '../../components/NeedsConnection';
import { Spinner } from '../../components/Spinner';
import { useOnline } from '../../lib/use-online';
import { useRecipe, useSaveRecipe } from './queries';
import { RecipeForm, type StepsReplacement } from './RecipeForm';
import { RefineSheet } from './RefineSheet';
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
  const [refining, setRefining] = useState(false);
  /** Подобряването, което още чака: затвореният и отворен пак лист продължава него. */
  const [refineId, setRefineId] = useState<string>();
  const [replacement, setReplacement] = useState<StepsReplacement>();
  const connection = useNeedsConnection(useOnline(), 'recipe-form__hint');
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
          replaceSteps={replacement}
          stepsAction={
            <>
              <button
                type="button"
                className="button button--quiet recipe-form__refine"
                disabled={connection.disabled}
                aria-describedby={connection.describedBy}
                onClick={() => setRefining(true)}
              >
                ✨ Подобри рецептата
              </button>
              {connection.hint}
            </>
          }
        />
      )}
      {refining && recipe.data && (
        <RefineSheet
          recipeId={id}
          steps={recipe.data.steps}
          preparation={recipe.data.preparation}
          requestId={refineId}
          onRequested={setRefineId}
          onAccept={(refinement) => {
            setReplacement((current) => ({
              key: (current?.key ?? 0) + 1,
              steps: refinement.steps,
              prepMinutes: refinement.prepMinutes,
              preparation: refinement.preparation,
            }));
            setRefineId(undefined);
            setRefining(false);
          }}
          onClose={(pending) => {
            if (!pending) {
              setRefineId(undefined);
            }
            setRefining(false);
          }}
        />
      )}
    </main>
  );
}
