import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const DATABASE_URL = 'postgres://family:secret@127.0.0.1:5432/family';
const DEV_USER_EMAIL = 'dev@example.com';
const TEAM_DOMAIN = 'https://family-test.cloudflareaccess.com';

const dev = { DATABASE_URL, AUTH_MODE: 'dev', DEV_USER_EMAIL };
const cloudflare = {
  DATABASE_URL,
  AUTH_MODE: 'cloudflare',
  CF_ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
  CF_ACCESS_AUD: 'aud-tag',
  ALLOWED_EMAILS: 'dani@example.com, Poli@Example.com',
};

const defaults = {
  NODE_ENV: 'development',
  API_HOST: '127.0.0.1',
  API_PORT: 18091,
  LOG_LEVEL: 'info',
  DATABASE_URL,
};

describe('loadConfig', () => {
  it('falls back to loopback defaults when only the required variables are given', () => {
    expect(loadConfig(dev)).toEqual({
      ...defaults,
      auth: { mode: 'dev', email: DEV_USER_EMAIL },
    });
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ AUTH_MODE: 'dev', DEV_USER_EMAIL })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a DATABASE_URL that is not a postgres url', () => {
    expect(() =>
      loadConfig({ ...dev, DATABASE_URL: 'mysql://family@127.0.0.1/family' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('names the offending variable when a value is invalid', () => {
    expect(() => loadConfig({ ...dev, API_PORT: 'eighteen' })).toThrow(
      /API_PORT/,
    );
  });

  describe('AUTH_MODE', () => {
    it('is required', () => {
      expect(() => loadConfig({ DATABASE_URL })).toThrow(/AUTH_MODE/);
    });

    it('rejects values other than cloudflare and dev', () => {
      expect(() => loadConfig({ ...dev, AUTH_MODE: 'none' })).toThrow(
        /AUTH_MODE/,
      );
    });

    it('in dev mode requires DEV_USER_EMAIL to be an e-mail address', () => {
      expect(() => loadConfig({ DATABASE_URL, AUTH_MODE: 'dev' })).toThrow(
        /DEV_USER_EMAIL/,
      );
      expect(() => loadConfig({ ...dev, DEV_USER_EMAIL: 'dani' })).toThrow(
        /DEV_USER_EMAIL/,
      );
    });

    it('in cloudflare mode requires the team domain and the AUD tag', () => {
      expect(() =>
        loadConfig({ ...cloudflare, CF_ACCESS_TEAM_DOMAIN: undefined }),
      ).toThrow(/CF_ACCESS_TEAM_DOMAIN/);
      expect(() =>
        loadConfig({ ...cloudflare, CF_ACCESS_AUD: undefined }),
      ).toThrow(/CF_ACCESS_AUD/);
    });

    it('in cloudflare mode splits ALLOWED_EMAILS on commas, trimmed and lowercased', () => {
      expect(loadConfig(cloudflare)).toEqual({
        ...defaults,
        auth: {
          mode: 'cloudflare',
          teamDomain: TEAM_DOMAIN,
          audience: 'aud-tag',
          allowedEmails: ['dani@example.com', 'poli@example.com'],
        },
      });
    });

    it('in cloudflare mode requires at least one valid allowed e-mail', () => {
      expect(() =>
        loadConfig({ ...cloudflare, ALLOWED_EMAILS: undefined }),
      ).toThrow(/ALLOWED_EMAILS/);
      expect(() =>
        loadConfig({ ...cloudflare, ALLOWED_EMAILS: ' , ' }),
      ).toThrow(/ALLOWED_EMAILS/);
      expect(() =>
        loadConfig({ ...cloudflare, ALLOWED_EMAILS: 'dani@example.com,poli' }),
      ).toThrow(/ALLOWED_EMAILS/);
    });

    it('strips a trailing slash from the team domain so it matches the token issuer', () => {
      expect(
        loadConfig({ ...cloudflare, CF_ACCESS_TEAM_DOMAIN: `${TEAM_DOMAIN}/` }),
      ).toMatchObject({ auth: { teamDomain: TEAM_DOMAIN } });
    });

    it('refuses dev mode in production', () => {
      expect(() => loadConfig({ ...dev, NODE_ENV: 'production' })).toThrow(
        /AUTH_MODE/,
      );
    });

    it('accepts cloudflare mode in production', () => {
      expect(
        loadConfig({ ...cloudflare, NODE_ENV: 'production' }),
      ).toMatchObject({ NODE_ENV: 'production', auth: { mode: 'cloudflare' } });
    });
  });
});
