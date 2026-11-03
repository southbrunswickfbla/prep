export const API_URL = (import.meta.env.VITE_API_URL || '').trim();
export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const MAIN_SITE = (import.meta.env.VITE_MAIN_SITE || 'https://southbrunswickfbla.github.io').replace(/\/$/, '');
export const RCE_TESTING_DATE = import.meta.env.VITE_RCE_TESTING_DATE || '2026-11-30';
export const ALLOWED_DOMAINS = (import.meta.env.VITE_ALLOWED_DOMAINS || 'sbstudents.org,sbschools.org')
  .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
/** With no backend URL configured, the site runs on sample questions so it can be previewed. */
export const DEMO = !API_URL;

export const mainSite = {
  home: MAIN_SITE + '/',
  competitions: (q?: string) => MAIN_SITE + '/competitions' + (q ? '?q=' + encodeURIComponent(q) : ''),
  eventFinder: MAIN_SITE + '/event-finder',
  schedule: MAIN_SITE + '/schedule',
  logo: MAIN_SITE + '/logo.png',
  logoLight: MAIN_SITE + '/logo-light.png',
};
