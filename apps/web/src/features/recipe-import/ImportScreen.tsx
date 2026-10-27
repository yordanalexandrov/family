import type { RecipeImportParams } from '@family/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { requestErrorFor } from '../../lib/ai-requests';
import { ImportLinkForm } from './ImportLinkForm';
import { ImportTextForm } from './ImportTextForm';
import { useRequestImport } from './queries';
import { RecentImports } from './RecentImports';
import '../recipes/recipes.css';
import '../suggestions/suggestions.css';
import './recipe-import.css';

type ImportTab = 'text' | 'url';

const TABS: { id: ImportTab; label: string }[] = [
  { id: 'text', label: 'Текст' },
  { id: 'url', label: 'Линк' },
];

/**
 * `?tab=text|url` (избраният таб), `?url=` (линкът, пренесен в таба „Текст“, напр. от „постави текста“) и `?text=`
 * (текст, попълнен в таба „Текст“) на `/recipes/import`.
 */
export interface ImportSearch {
  tab?: ImportTab;
  url?: string;
  text?: string;
}

/**
 * Невалидният параметър става изрично `undefined`: router-ът слива резултата върху суровия search на root route-а,
 * така че изпуснат ключ би оставил суровата стойност.
 */
export function parseImportSearch(
  search: Record<string, unknown>,
): ImportSearch {
  const text = (value: unknown) =>
    typeof value === 'string' && value.trim() !== '' ? value : undefined;
  return {
    tab: search.tab === 'text' || search.tab === 'url' ? search.tab : undefined,
    url: text(search.url),
    text: text(search.text),
  };
}

/**
 * `/recipes/import` („Внеси рецепта“): табовете за източника („Текст“, „Линк“) и последните внасяния под тях.
 * „Снимка“ идва със своя билет като още един таб.
 */
export function ImportScreen() {
  const search = useSearch({ from: '/recipes/import' });
  const [tab, setTab] = useState<ImportTab>(search.tab ?? 'text');
  const requestImport = useRequestImport();
  const navigate = useNavigate();

  const submit = (params: RecipeImportParams) =>
    requestImport.mutate(params, {
      onSuccess(request) {
        void navigate({
          to: '/recipes/import/$requestId',
          params: { requestId: request.id },
        });
      },
    });
  const formProps = {
    isSubmitting: requestImport.isPending,
    submitError: requestImport.error
      ? requestErrorFor(requestImport.error)
      : undefined,
    onSubmit: submit,
  };

  return (
    <main className="screen recipes">
      <header className="recipes__header">
        <Link to="/recipes" className="recipes__back recipes__back--block">
          ← Рецепти
        </Link>
        <h1 className="recipes__title">Внеси рецепта</h1>
      </header>
      <div className="import-tabs" role="tablist" aria-label="Източник">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`import-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`import-panel-${id}`}
            className="import-tabs__tab"
            onClick={() => {
              setTab(id);
              requestImport.reset();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`import-panel-${tab}`}
        aria-labelledby={`import-tab-${tab}`}
      >
        {tab === 'text' ? (
          <ImportTextForm
            {...formProps}
            initialText={search.text}
            initialUrl={search.url}
          />
        ) : (
          <ImportLinkForm {...formProps} />
        )}
      </div>
      <RecentImports />
    </main>
  );
}
