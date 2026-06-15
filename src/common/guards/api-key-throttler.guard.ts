import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

/**
 * Throttler that rate-limits by API key when the request carries one, else by client IP.
 *
 * M3 fix: external API endpoints (institute-api-keys) were limited per-IP, so an attacker
 * rotating source IPs could evade the cap, and many legitimate keys behind one NAT collided.
 *
 * This guard runs as a GLOBAL guard, BEFORE the route-level InstituteApiKeyGuard sets
 * `req.apiKey`. So we don't rely on that — we derive the tracker straight from the
 * `Authorization: Bearer <key>` header by hashing it (we never store/log the raw key),
 * which matches how InstituteApiKeyGuard identifies the key. Only the external API paths
 * use bearer API keys; JWT bearer tokens for normal routes also get hashed here, which is
 * harmless (a per-token budget, still effectively per-user/session) and avoids leaking the
 * token. Requests without a bearer token fall back to the default IP tracker.
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Prefer an already-resolved key (if a guard ran first).
    if (req?.apiKey?.id) return `key:${req.apiKey.id}`;

    const auth: string | undefined = req?.headers?.['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      const raw = auth.slice(7).trim();
      if (raw) {
        // Hash so the raw bearer value never becomes a cache key / log line.
        return `bearer:${crypto.createHash('sha256').update(raw).digest('hex')}`;
      }
    }

    // Fall back to the default IP-based tracker.
    return super.getTracker(req);
  }
}
