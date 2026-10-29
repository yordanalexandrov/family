import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

/** Екранът държи съобщението в state и го маха в `onDone`, както PantryScreen. */
function Host({
  durationMs,
  onUndo,
}: {
  durationMs?: number;
  onUndo?: () => void;
}) {
  const [message, setMessage] = useState<string | null>('Рецептата е изтрита');
  return (
    <Toast
      message={message}
      onDone={() => setMessage(null)}
      durationMs={durationMs}
      undo={onUndo}
    />
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('без действие изчезва след durationMs', () => {
    render(<Host durationMs={4000} />);
    expect(screen.getByText('Рецептата е изтрита')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText('Рецептата е изтрита')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Рецептата е изтрита')).not.toBeInTheDocument();
  });

  it('стои извън съдържанието на екрана, за да е над долната лента и вътре в карта', () => {
    const { container } = render(
      <section aria-label="Известия">
        <Host />
      </section>,
    );

    const message = screen.getByText('Рецептата е изтрита');
    expect(container).not.toContainElement(message);
    expect(message.closest('.toast')?.parentElement).toBe(document.body);
  });

  it('„Върни“ вика undo веднъж и скрива съобщението', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const undo = vi.fn();
    render(<Host onUndo={undo} />);

    await user.click(screen.getByRole('button', { name: 'Върни' }));

    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Рецептата е изтрита')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Върни' }),
    ).not.toBeInTheDocument();
  });

  it('с „Върни“ стои 8 s по подразбиране, а изтичането не вика undo', () => {
    const undo = vi.fn();
    render(<Host onUndo={undo} />);

    act(() => vi.advanceTimersByTime(7999));
    expect(screen.getByRole('button', { name: 'Върни' })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText('Рецептата е изтрита')).not.toBeInTheDocument();
    expect(undo).not.toHaveBeenCalled();
  });
});
