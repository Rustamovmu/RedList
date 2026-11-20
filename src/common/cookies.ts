import type { Request, Response } from 'express';

/** Minimal cookie parsing; avoids another dependency. Values are URI-decoded; malformed pairs are skipped. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export type CookieOpts = { httpOnly: boolean; secure: boolean; maxAgeSeconds?: number };

/** Path=/ and no Domain, so the __Host- prefix is valid whenever Secure is set. SameSite=Lax per PLAN §9. */
export function setCookie(res: Response, name: string, value: string, o: CookieOpts) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (o.httpOnly) parts.push('HttpOnly');
  if (o.secure) parts.push('Secure');
  if (o.maxAgeSeconds !== undefined) parts.push(`Max-Age=${o.maxAgeSeconds}`);
  res.append('Set-Cookie', parts.join('; '));
}

export function clearCookie(res: Response, name: string, secure: boolean) {
  setCookie(res, name, '', { httpOnly: true, secure, maxAgeSeconds: 0 });
}
