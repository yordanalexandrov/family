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
  OPENCLAW_GATEWAY_PASSWORD: 'gateway-secret',
};

const defaults = {
  NODE_ENV: 'development',
  API_HOST: '127.0.0.1',
  API_PORT: 18091,
  LOG_LEVEL: 'info',
  DATABASE_URL,
  googleCalendar: null,
  wallet: null,
  vapid: null,
  openclaw: {
    url: 'http://127.0.0.1:18789',
    gatewayPassword: undefined,
    recipeAgent: 'family-recipe',
    menuAgent: 'family-menu',
    mealAgent: 'family-meal',
    importAgent: 'family-import',
    refineAgent: 'family-refine',
    cookAgent: 'family-cook',
    timeoutMs: 180_000,
    cookTimeoutMs: 120_000,
  },
};

const calendars = [
  {
    googleCalendarId: 'dani@example.com',
    name: 'Дани',
    ownerUserId: '11111111-1111-4111-8111-111111111111',
    colorToken: 'person-1',
  },
  {
    googleCalendarId: 'family@group.calendar.google.com',
    name: 'Семеен',
    ownerUserId: null,
    colorToken: 'family',
  },
];

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

  describe('OPENCLAW_*', () => {
    it('reads the gateway url, password, recipe agent and timeout', () => {
      expect(
        loadConfig({
          ...dev,
          OPENCLAW_URL: 'http://127.0.0.1:28789/',
          OPENCLAW_GATEWAY_PASSWORD: 'gateway-secret',
          OPENCLAW_RECIPE_AGENT: 'family-recipe-test',
          OPENCLAW_MENU_AGENT: 'family-menu-test',
          OPENCLAW_MEAL_AGENT: 'family-meal-test',
          OPENCLAW_IMPORT_AGENT: 'family-import-test',
          OPENCLAW_REFINE_AGENT: 'family-refine-test',
          OPENCLAW_COOK_AGENT: 'family-cook-test',
          OPENCLAW_TIMEOUT_MS: '60000',
        }),
      ).toMatchObject({
        openclaw: {
          url: 'http://127.0.0.1:28789',
          gatewayPassword: 'gateway-secret',
          recipeAgent: 'family-recipe-test',
          menuAgent: 'family-menu-test',
          mealAgent: 'family-meal-test',
          importAgent: 'family-import-test',
          refineAgent: 'family-refine-test',
          cookAgent: 'family-cook-test',
          timeoutMs: 60_000,
          cookTimeoutMs: 60_000,
        },
      });
    });

    it('treats an empty password as none, so OpenClaw stays disabled in dev mode', () => {
      expect(
        loadConfig({ ...dev, OPENCLAW_GATEWAY_PASSWORD: '' }),
      ).toMatchObject({ openclaw: { gatewayPassword: undefined } });
    });

    it('requires the gateway password outside dev mode, in production and out of it', () => {
      for (const NODE_ENV of ['production', 'development']) {
        expect(() =>
          loadConfig({
            ...cloudflare,
            NODE_ENV,
            OPENCLAW_GATEWAY_PASSWORD: '',
          }),
        ).toThrow(/OPENCLAW_GATEWAY_PASSWORD/);
      }
    });

    it('never puts the password into the error message', () => {
      const load = () =>
        loadConfig({
          ...dev,
          OPENCLAW_GATEWAY_PASSWORD: 'gateway-secret',
          OPENCLAW_TIMEOUT_MS: 'soon',
        });
      expect(load).toThrow(/OPENCLAW_TIMEOUT_MS/);
      expect(load).not.toThrow(/gateway-secret/);
    });
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
        openclaw: { ...defaults.openclaw, gatewayPassword: 'gateway-secret' },
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
        loadConfig({
          ...cloudflare,
          NODE_ENV: 'production',
          OPENCLAW_GATEWAY_PASSWORD: 'gateway-secret',
        }),
      ).toMatchObject({ NODE_ENV: 'production', auth: { mode: 'cloudflare' } });
    });
  });

  describe('Google Calendar and Wallet', () => {
    it('are optional: without them the api starts with both sources unconfigured', () => {
      expect(loadConfig(dev)).toMatchObject({
        googleCalendar: null,
        wallet: null,
      });
    });

    it('treat empty values (blank lines in .env) as missing', () => {
      expect(
        loadConfig({
          ...dev,
          GOOGLE_SERVICE_ACCOUNT_JSON: '',
          GOOGLE_CALENDARS: '',
          WALLET_API_TOKEN: '',
          WALLET_BUDGET_ID: '',
        }),
      ).toMatchObject({ googleCalendar: null, wallet: null });
    });

    it('parse GOOGLE_CALENDARS as a JSON list of calendar sources', () => {
      const config = loadConfig({
        ...dev,
        GOOGLE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
        GOOGLE_CALENDARS: JSON.stringify(calendars),
      });

      expect(config.googleCalendar).toEqual({
        serviceAccountJson: '{"type":"service_account"}',
        calendars,
      });
    });

    it('need both the service account and the calendars for the calendar to be configured', () => {
      expect(
        loadConfig({ ...dev, GOOGLE_CALENDARS: JSON.stringify(calendars) })
          .googleCalendar,
      ).toBeNull();
      expect(
        loadConfig({ ...dev, GOOGLE_SERVICE_ACCOUNT_JSON: '{}' })
          .googleCalendar,
      ).toBeNull();
    });

    it('reject GOOGLE_CALENDARS that is not JSON', () => {
      expect(() =>
        loadConfig({ ...dev, GOOGLE_CALENDARS: '[{googleCalendarId:' }),
      ).toThrow(/GOOGLE_CALENDARS/);
    });

    it('reject a calendar with a colour that is not a calendar token', () => {
      expect(() =>
        loadConfig({
          ...dev,
          GOOGLE_CALENDARS: JSON.stringify([
            { ...calendars[0], colorToken: '#d9480f' },
          ]),
        }),
      ).toThrow(/GOOGLE_CALENDARS/);
    });

    it('need both the Wallet token and the budget id for the budget to be configured', () => {
      expect(
        loadConfig({ ...dev, WALLET_API_TOKEN: 'token' }).wallet,
      ).toBeNull();
      expect(
        loadConfig({
          ...dev,
          WALLET_API_TOKEN: 'token',
          WALLET_BUDGET_ID: 'budget-1',
        }),
      ).toMatchObject({
        wallet: { apiToken: 'token', budgetId: 'budget-1' },
      });
    });
  });
  describe('VAPID_*', () => {
    const vapid = {
      VAPID_PUBLIC_KEY:
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
      VAPID_PRIVATE_KEY: 'tUxbf-Ww9wJ9Fk3fXl3b6n2nJxP7Zr0Fb0l4oQe4yTg',
      VAPID_SUBJECT: 'mailto:family@example.com',
    };

    it('are optional: without them Web Push is off', () => {
      expect(loadConfig(dev).vapid).toBeNull();
      expect(
        loadConfig({
          ...dev,
          VAPID_PUBLIC_KEY: '',
          VAPID_PRIVATE_KEY: '',
          VAPID_SUBJECT: '',
        }).vapid,
      ).toBeNull();
    });

    it('turn Web Push on together', () => {
      expect(loadConfig({ ...dev, ...vapid })).toMatchObject({
        vapid: {
          publicKey: vapid.VAPID_PUBLIC_KEY,
          privateKey: vapid.VAPID_PRIVATE_KEY,
          subject: vapid.VAPID_SUBJECT,
        },
      });
    });

    it('are all or nothing, naming the missing one', () => {
      expect(() =>
        loadConfig({ ...dev, ...vapid, VAPID_PRIVATE_KEY: '' }),
      ).toThrow(/VAPID_PRIVATE_KEY/);
      expect(() =>
        loadConfig({ ...dev, VAPID_SUBJECT: vapid.VAPID_SUBJECT }),
      ).toThrow(/VAPID_PUBLIC_KEY/);
    });

    it('take a mailto: or https subject only', () => {
      expect(
        loadConfig({
          ...dev,
          ...vapid,
          VAPID_SUBJECT: 'https://family.example.com',
        }).vapid?.subject,
      ).toBe('https://family.example.com');
      expect(() =>
        loadConfig({ ...dev, ...vapid, VAPID_SUBJECT: 'family@example.com' }),
      ).toThrow(/VAPID_SUBJECT/);
    });

    it('never put the private key into the error message', () => {
      const load = () =>
        loadConfig({ ...dev, ...vapid, VAPID_SUBJECT: 'nope' });
      expect(load).toThrow(/VAPID_SUBJECT/);
      expect(load).not.toThrow(new RegExp(vapid.VAPID_PRIVATE_KEY));
    });
  });
});
