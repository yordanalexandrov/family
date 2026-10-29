import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar';

describe('ActionBar', () => {
  it('основното действие е бутон с подадения надпис', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ActionBar primary={{ label: 'Свържи', onClick }} />);

    await user.click(screen.getByRole('button', { name: 'Свържи' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('показва текста и вторичното действие', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(
      <ActionBar
        text="3 продукта за свързване"
        primary={{ label: 'Свържи', onClick: vi.fn() }}
        secondary={[{ label: 'Пропусни', onClick: onSkip }]}
      />,
    );

    expect(screen.getByText('3 продукта за свързване')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пропусни' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('забраненото основно действие не се натиска', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ActionBar primary={{ label: 'Свържи', onClick, disabled: true }} />,
    );

    const button = screen.getByRole('button', { name: 'Свържи' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
