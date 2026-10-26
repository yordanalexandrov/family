import { Link, useNavigate } from '@tanstack/react-router';
import { requestErrorFor } from '../../lib/ai-requests';
import { useRequestSuggestions } from './queries';
import { RecentRequests } from './RecentRequests';
import { SuggestForm } from './SuggestForm';
import '../recipes/recipes.css';
import './suggestions.css';

/** `/recipes/suggest`: формата за заявка и последните заявки под нея. */
export function SuggestScreen() {
  const requestSuggestions = useRequestSuggestions();
  const navigate = useNavigate();
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link to="/recipes" className="recipes__back recipes__back--block">
          ← Рецепти
        </Link>
        <h1 className="recipes__title">Поискай предложения</h1>
      </header>
      <SuggestForm
        isSubmitting={requestSuggestions.isPending}
        submitError={
          requestSuggestions.error
            ? requestErrorFor(requestSuggestions.error)
            : undefined
        }
        onSubmit={(params) =>
          requestSuggestions.mutate(params, {
            onSuccess(request) {
              void navigate({
                to: '/recipes/suggest/$requestId',
                params: { requestId: request.id },
              });
            },
          })
        }
      />
      <RecentRequests />
    </main>
  );
}
