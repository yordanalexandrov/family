import { describe, expect, it } from 'vitest';
import { type ScheduleState, scheduledProposalDue } from './menu-schedule.js';

const FREE: ScheduleState = { hasPlan: false, requests: [] };

describe('scheduledProposalDue', () => {
  // Week of 2026-11-02 (Monday); Sofia is on UTC+2 then.
  it('is not due on Tuesday', () => {
    expect(scheduledProposalDue(new Date('2026-11-03T10:00:00Z'), FREE)).toBe(
      null,
    );
  });

  it('is due from Wednesday 09:00 in Sofia, for the next week', () => {
    expect(scheduledProposalDue(new Date('2026-11-04T06:59:00Z'), FREE)).toBe(
      null,
    );
    expect(scheduledProposalDue(new Date('2026-11-04T07:00:00Z'), FREE)).toBe(
      '2026-11-09',
    );
  });

  it('is still due on Sunday when the next week has no plan', () => {
    expect(scheduledProposalDue(new Date('2026-11-08T21:00:00Z'), FREE)).toBe(
      '2026-11-09',
    );
  });

  it('is not due when the next week has a plan', () => {
    expect(
      scheduledProposalDue(new Date('2026-11-05T10:00:00Z'), {
        hasPlan: true,
        requests: [],
      }),
    ).toBe(null);
  });

  it('is not due while a proposal for the next week is pending', () => {
    expect(
      scheduledProposalDue(new Date('2026-11-05T10:00:00Z'), {
        hasPlan: false,
        requests: [{ trigger: 'user', status: 'pending' }],
      }),
    ).toBe(null);
  });

  it('is not due again after the schedule has failed for the next week', () => {
    expect(
      scheduledProposalDue(new Date('2026-11-05T10:00:00Z'), {
        hasPlan: false,
        requests: [{ trigger: 'schedule', status: 'failed' }],
      }),
    ).toBe(null);
  });

  it('is due after a failed proposal of a user', () => {
    expect(
      scheduledProposalDue(new Date('2026-11-05T10:00:00Z'), {
        hasPlan: false,
        requests: [{ trigger: 'user', status: 'failed' }],
      }),
    ).toBe('2026-11-09');
  });

  it('keeps 09:00 in Sofia on summer time (UTC+3)', () => {
    // 2026-03-29 is the switch to summer time; Wednesday is 2026-04-01.
    expect(scheduledProposalDue(new Date('2026-04-01T05:59:00Z'), FREE)).toBe(
      null,
    );
    expect(scheduledProposalDue(new Date('2026-04-01T06:00:00Z'), FREE)).toBe(
      '2026-04-06',
    );
  });

  it('keeps 09:00 in Sofia right after the switch back to winter time', () => {
    // 2026-10-25 is the switch to winter time; Wednesday is 2026-10-28.
    expect(scheduledProposalDue(new Date('2026-10-28T06:59:00Z'), FREE)).toBe(
      null,
    );
    expect(scheduledProposalDue(new Date('2026-10-28T07:00:00Z'), FREE)).toBe(
      '2026-11-02',
    );
  });

  it('counts the Sunday of a time switch in the old week', () => {
    // 23:30 on Sunday 2026-10-25 in Sofia (UTC+2 by then) still belongs to the week of 2026-10-19.
    expect(scheduledProposalDue(new Date('2026-10-25T21:30:00Z'), FREE)).toBe(
      '2026-10-26',
    );
  });
});
