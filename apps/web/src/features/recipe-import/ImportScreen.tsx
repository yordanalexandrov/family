import type { RecipeImportParams } from '@family/shared';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { requestErrorFor } from '../../lib/ai-requests';
import { ImportLinkForm } from './ImportLinkForm';
import { ImportTextForm } from './ImportTextForm';
import { useRequestImport } from './queries';
import { RecentImports } from './RecentImports';
import { importFromShare } from './share-target';
import '../recipes/recipes.css';
import '../suggestions/suggestions.css';
import './recipe-import.css';

type ImportTab = 'text' | 'url';

const TABS: { id: ImportTab; label: string }[] = [
  { id: 'text', label: 'Текст' },
  { id: 'url', label: 'Линк' },
];

/**
 * Search на `/recipes/import`. С `?tab=text|url` (вътрешна навигация, напр. „постави текста“) `url` и `text` само
 * попълват полетата на таба. Без `tab` адресът идва от share target-а на PWA-то (`vite.config.ts`): `title`, `text`
 * и `url` от споделянето пускат внасяне веднага (`importFromShare`).
 */
export interface ImportSearch {
  tab?: ImportTab;
  url?: string;
  text?: string;
  title?: string;
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
    title: text(search.title),
  };
}

/**
 * `/recipes/import` („Внеси рецепта“): табовете за източника („Текст“, „Линк“) и последните внасяния под тях.
 * „Снимка“ идва със своя билет като още един таб.
 *
 * Споделяне („Сподели → Family“) пуска внасянето веднага и подменя адреса (`replace`) с таба и полето му, затова
 * презареждане не пуска второ внасяне, а грешка (напр. 409 „Вече е в регистъра“) остава в таба с попълнения линк.
 */
export function ImportScreen() {
  const search = useSearch({ from: '/recipes/import' });
  const [shared] = useState(() =>
    search.tab === undefined ? importFromShare(search) : null,
  );
  const [tab, setTab] = useState<ImportTab>(
    shared ? (shared.kind === 'url' ? 'url' : 'text') : (search.tab ?? 'text'),
  );
  const requestImport = useRequestImport();
  const navigate = useNavigate();

  const submit = (params: RecipeImportParams, replace = false) =>
    requestImport.mutate(params, {
      onSuccess(request) {
        void navigate({
          to: '/recipes/import/$requestId',
          params: { requestId: request.id },
          replace,
        });
      },
    });

  // Една заявка на споделяне, и в StrictMode (ref-ът оцелява при двойното пускане на ефекта).
  const sharedStarted = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: само при отваряне — споделянето е в адреса, с който екранът се е отворил
  useEffect(() => {
    if (!shared || sharedStarted.current) {
      return;
    }
    sharedStarted.current = true;
    void navigate({
      to: '/recipes/import',
      search:
        shared.kind === 'url'
          ? { tab: 'url', url: shared.url }
          : { tab: 'text', text: shared.text },
      replace: true,
    });
    submit(shared, true);
  }, []);
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
            initialText={shared?.kind === 'text' ? shared.text : search.text}
            initialUrl={shared ? undefined : search.url}
          />
        ) : (
          <ImportLinkForm
            {...formProps}
            initialUrl={shared?.kind === 'url' ? shared.url : search.url}
          />
        )}
      </div>
      <RecentImports />
    </main>
  );
}
