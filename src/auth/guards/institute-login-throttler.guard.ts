import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits institute login attempts per (instituteId, userIdByInstitute)
 * instead of per client IP.
 *
 * Live-lecture join links are public and frequently shared with an entire
 * class — many real students end up joining from the same school/home WiFi,
 * so they share one public IP. An IP-keyed throttle on this route meant the
 * 6th+ student behind that IP got rate-limited within minutes, and saw an
 * error that looked identical to "wrong password" even though their
 * credentials were correct — the request never even reached the password
 * check. Keying by the actual account being logged into keeps brute-force
 * protection per account while no longer collapsing unrelated students'
 * attempts into one shared budget.
 */
@Injectable()
export class InstituteLoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const instituteId = req?.body?.instituteId;
    const userIdByInstitute = req?.body?.userIdByInstitute;
    if (instituteId && userIdByInstitute) {
      return `inst-login:${instituteId}:${userIdByInstitute}`;
    }
    // Malformed body — fall back to IP so the route still has *some* limit.
    return super.getTracker(req);
  }
}
