import { Link, useNavigate } from '@tanstack/react-router';
import { requestErrorFor } from '../../lib/ai-requests';
import { ImportTextForm } from './ImportTextForm';
import { useRequestImport } from './queries';
import { RecentImports } from './RecentImports';
import '../recipes/recipes.css';
import '../suggestions/suggestions.css';
import './recipe-import.css';

/**
 * `/recipes/import` („Внеси рецепта“): табовете за източника и последните внасяния под тях. Тук е само „Текст“;
 * „Линк“ и „Снимка“ идват със своите билети като още табове.
 */
export function ImportScreen() {
  const requestImport = useRequestImport();
  const navigate = useNavigate();
  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link to="/recipes" className="recipes__back recipes__back--block">
          ← Рецепти
        </Link>
        <h1 className="recipes__title">Внеси рецепта</h1>
      </header>
      <div className="import-tabs" role="tablist" aria-label="Източник">
        <button
          type="button"
          role="tab"
          id="import-tab-text"
          aria-selected="true"
          aria-controls="import-panel-text"
          className="import-tabs__tab"
        >
          Текст
        </button>
      </div>
      <div
        role="tabpanel"
        id="import-panel-text"
        aria-labelledby="import-tab-text"
      >
        <ImportTextForm
          isSubmitting={requestImport.isPending}
          submitError={
            requestImport.error
              ? requestErrorFor(requestImport.error)
              : undefined
          }
          onSubmit={(params) =>
            requestImport.mutate(params, {
              onSuccess(request) {
                void navigate({
                  to: '/recipes/import/$requestId',
                  params: { requestId: request.id },
                });
              },
            })
          }
        />
      </div>
      <RecentImports />
    </main>
  );
}
