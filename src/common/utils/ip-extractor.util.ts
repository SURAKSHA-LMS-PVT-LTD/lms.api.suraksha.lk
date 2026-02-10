import { Request as ExpressRequest } from 'express';

/**
 * Extract the real client IP address from request
 * Handles cases where app is behind proxy/load balancer/CDN
 * 
 * Priority Order:
 * 1. X-Forwarded-For (first IP in chain) - Cloudflare, nginx, load balancers
 * 2. X-Real-IP - nginx reverse proxy
 * 3. CF-Connecting-IP - Cloudflare
 * 4. X-Client-IP - Apache
 * 5. req.ip - Express default
 * 6. req.connection.remoteAddress - Direct connection
 * 
 * @param req Express request object
 * @returns Client IP address or 'unknown'
 */
export function getClientIp(req: ExpressRequest): string {
  try {
    // 1. Check X-Forwarded-For (most common for proxies)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
      // Take the first one (original client)
      const ips = typeof forwardedFor === 'string' 
        ? forwardedFor.split(',').map(ip => ip.trim())
        : [forwardedFor[0]];
      
      const clientIp = ips[0];
      if (clientIp && clientIp !== '::1' && clientIp !== '127.0.0.1') {
        return clientIp;
      }
    }

    // 2. Check X-Real-IP (nginx)
    const realIp = req.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      return realIp;
    }

    // 3. Check CF-Connecting-IP (Cloudflare)
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp && typeof cfIp === 'string') {
      return cfIp;
    }

    // 4. Check X-Client-IP (Apache)
    const clientIp = req.headers['x-client-ip'];
    if (clientIp && typeof clientIp === 'string') {
      return clientIp;
    }

    // 5. Express default (req.ip)
    if (req.ip) {
      return req.ip;
    }

    // 6. Direct connection
    if (req.connection?.remoteAddress) {
      return req.connection.remoteAddress;
    }

    // 7. Socket fallback
    if ((req as any).socket?.remoteAddress) {
      return (req as any).socket.remoteAddress;
    }

    return 'unknown';
  } catch (error) {
    console.error('Error extracting client IP:', error);
    return 'unknown';
  }
}

/**
 * Check if IP address is valid (not localhost or link-local)
 * Link-local addresses like 169.254.x.x indicate misconfiguration
 * 
 * @param ip IP address to validate
 * @returns true if IP is valid for logging
 */
export function isValidPublicIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  
  // Localhost
  if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return false;
  
  // Link-local (169.254.x.x) - indicates proxy misconfiguration
  if (ip.startsWith('169.254.')) return false;
  
  // Private networks (optional - you may want to allow these in development)
  // if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) {
  //   return false;
  // }
  
  return true;
}

/**
 * Get client IP with validation warning
 * Logs warning if IP is link-local (169.254.x.x) indicating proxy misconfiguration
 * 
 * @param req Express request object
 * @returns Client IP address with validation
 */
export function getClientIpWithValidation(req: ExpressRequest): {
  ip: string;
  isValid: boolean;
  warning?: string;
} {
  const ip = getClientIp(req);
  const isValid = isValidPublicIp(ip);
  
  let warning: string | undefined;
  if (!isValid && ip.startsWith('169.254.')) {
    warning = 'Link-local IP detected (169.254.x.x) - Check proxy configuration. Set trust proxy in main.ts or configure X-Forwarded-For headers.';
  }
  
  return { ip, isValid, warning };
}
