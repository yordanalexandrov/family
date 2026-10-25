import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopBar } from './TopBar';

// 25 октомври 2026, 10:00 в София.
const now = new Date('2026-10-25T08:00:00Z');

describe('TopBar', () => {
  it('показва днешната дата в София', () => {
    render(
      <TopBar
        now={now}
        sync={{ calendar: { status: 'ok' }, budget: { status: 'ok' } }}
      />,
    );

    expect(screen.getByText(/неделя, 25 октомври 2026/)).toBeInTheDocument();
  });

  it.each([
    ['ok', 'Календар: актуални данни', 'ok'],
    ['stale', 'Календар: остарели данни', 'stale'],
    ['failed', 'Календар: неуспешна синхронизация', 'stale'],
    ['unconfigured', 'Календар: не е конфигуриран', 'off'],
  ] as const)('статус %s → точка „%s“ (%s)', (status, label, tone) => {
    render(
      <TopBar
        now={now}
        sync={{ calendar: { status }, budget: { status: 'ok' } }}
      />,
    );

    const dot = screen.getByRole('img', { name: label });
    expect(dot).toHaveAttribute('data-tone', tone);
  });

  it('има точка за всеки източник', () => {
    render(
      <TopBar
        now={now}
        sync={{
          calendar: { status: 'ok' },
          budget: { status: 'unconfigured' },
        }}
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Календар: актуални данни' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Бюджет: не е конфигуриран' }),
    ).toBeInTheDocument();
  });
});
