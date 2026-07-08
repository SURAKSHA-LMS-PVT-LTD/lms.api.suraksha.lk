import { Request as ExpressRequest } from 'express';

/**
 * Determines whether a request originated from a verified institute custom
 * domain (e.g. lms.thilinadhananjaya.lk) rather than the main site or a
 * *.suraksha.lk subdomain.
 *
 * Used to decide refresh_token cookie scoping — see buildRefreshCookieOptions.
 */
export function isCustomDomainOrigin(req: ExpressRequest): { isCustomDomain: boolean; host: string | null } {
  const origin = (req.headers['origin'] || req.headers['referer'] || '') as string;
  if (!origin) return { isCustomDomain: false, host: null };
  try {
    const host = new URL(origin).hostname;
    const mainHost = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).hostname : 'lms.suraksha.lk';
    if (host === mainHost) return { isCustomDomain: false, host };
    if (host.endsWith('.suraksha.lk')) return { isCustomDomain: false, host };
    if (host === 'localhost' || host === '127.0.0.1') return { isCustomDomain: false, host };
    return { isCustomDomain: true, host };
  } catch {
    return { isCustomDomain: false, host: null };
  }
}

/**
 * Build refresh_token cookie options scoped correctly for the requesting origin.
 *
 * MAIN / *.suraksha.lk subdomains: Domain=.suraksha.lk lets the browser send the
 * cookie from e.g. academy.suraksha.lk to lmsapi.suraksha.lk — that XHR is
 * "same-site" (same registrable domain), so SameSite=Lax covers it.
 *
 * Verified custom domains (e.g. lms.thilinadhananjaya.lk) are a DIFFERENT
 * registrable domain than lmsapi.suraksha.lk — the browser silently refuses to
 * even set a cookie whose Domain doesn't match the response's own host, so
 * Domain must be omitted (defaults to the exact host). And because the
 * refresh XHR from that frontend to lmsapi.suraksha.lk is genuinely
 * cross-SITE (not just cross-origin), SameSite=Lax cookies are never
 * attached to it — only SameSite=None is. Previously this was hardcoded to
 * .suraksha.lk/Lax unconditionally everywhere, which silently dropped the
 * cookie for every custom-domain tenant: refresh 401'd on the very next
 * request after login, cascading into every other 401 that depends on a
 * valid session — until a full page reload happened to pick up a
 * still-valid in-memory token via a different path and masked the failure.
 */
export function buildRefreshCookieOptions(req: ExpressRequest, isProduction: boolean, maxAge: number) {
  const { isCustomDomain } = isCustomDomainOrigin(req);
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isCustomDomain ? 'none' : 'lax') as 'none' | 'lax',
    maxAge,
    path: '/',
    ...(isCustomDomain ? {} : { domain: isProduction ? '.suraksha.lk' : 'localhost' }),
  };
}

/**
 * Options for res.clearCookie('refresh_token', ...) — browsers match cookies
 * to delete by name+Domain+Path, so this must mirror whichever Domain
 * buildRefreshCookieOptions actually used when the cookie was set, or the
 * clear silently no-ops and the cookie lingers.
 */
export function clearRefreshCookieOptions(req: ExpressRequest, isProduction: boolean) {
  const { isCustomDomain } = isCustomDomainOrigin(req);
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isCustomDomain ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    ...(isCustomDomain ? {} : { domain: isProduction ? '.suraksha.lk' : 'localhost' }),
  };
}
