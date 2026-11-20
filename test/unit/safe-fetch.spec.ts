/** SSRF-safe fetcher (PLAN §9, DECISIONS D-026) and upload sniffing. No real network: resolver and transport are injected. */
import { checkUrlShape, isBlockedAddress, safeFetch, SafeFetchError, Transport } from '../../src/common/safe-fetch';
import { pickVariant, sniffImage } from '../../src/media/image-pipeline';

const PUBLIC = '93.184.215.14';
const ok: Transport = async () => ({ status: 200, headers: {}, body: Buffer.from('ok') });

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.5.4', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1', '::127.0.0.1', '64:ff9b::7f00:1',
    'not-an-ip',
  ])('blocks %s', (a) => expect(isBlockedAddress(a)).toBe(true));

  it.each(['93.184.215.14', '8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '172.32.0.1'])('allows %s', (a) => expect(isBlockedAddress(a)).toBe(false));
});

describe('checkUrlShape', () => {
  it.each(['http://example.org/', 'ftp://example.org/', 'https://user:pw@example.org/', 'https://example.org:8443/', 'file:///etc/passwd', 'not a url', 'javascript:alert(1)'])(
    'refuses %s',
    (u) => expect(() => checkUrlShape(u)).toThrow(SafeFetchError),
  );
  it('accepts plain https', () => expect(checkUrlShape('https://example.org/a?b=1').hostname).toBe('example.org'));
});

describe('safeFetch', () => {
  const resolveTo = (...addresses: string[]) => async () => addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

  it('refuses a host that resolves to a private address, even if another answer is public (no partial trust)', async () => {
    await expect(safeFetch('https://internal.example/', {}, { resolve: resolveTo(PUBLIC, '10.0.0.5'), transport: ok })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('https://[::1]/', {}, { resolve: resolveTo(PUBLIC), transport: ok })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('https://127.0.0.1/', {}, { resolve: resolveTo(PUBLIC), transport: ok })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
  });

  it('connects to the address it checked (pinned), not a fresh lookup', async () => {
    const seen: string[] = [];
    const t: Transport = async (_u, address) => {
      seen.push(address);
      return { status: 200, headers: {}, body: Buffer.from('x') };
    };
    const r = await safeFetch('https://example.org/x', {}, { resolve: resolveTo(PUBLIC), transport: t });
    expect(r.status).toBe(200);
    expect(seen).toEqual([PUBLIC]);
  });

  it('re-checks every redirect hop and refuses a redirect to a blocked host or to http', async () => {
    const redirectTo = (location: string): Transport => async (u) =>
      u.hostname === 'example.org' ? { status: 302, headers: { location }, body: Buffer.alloc(0) } : { status: 200, headers: {}, body: Buffer.from('secret') };
    const resolve = async (h: string) => [{ address: h === 'metadata.internal' ? '169.254.169.254' : PUBLIC, family: 4 }];
    await expect(safeFetch('https://example.org/', {}, { resolve, transport: redirectTo('https://metadata.internal/latest') })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('https://example.org/', {}, { resolve, transport: redirectTo('https://169.254.169.254/') })).rejects.toMatchObject({ code: 'BLOCKED_ADDRESS' });
    await expect(safeFetch('https://example.org/', {}, { resolve, transport: redirectTo('http://example.net/') })).rejects.toMatchObject({ code: 'BAD_URL' });
    const fine = await safeFetch('https://example.org/', {}, { resolve, transport: redirectTo('https://cdn.example.net/file') });
    expect(fine.finalUrl).toBe('https://cdn.example.net/file');
  });

  it('stops after too many redirects', async () => {
    const loop: Transport = async () => ({ status: 301, headers: { location: 'https://example.org/again' }, body: Buffer.alloc(0) });
    await expect(safeFetch('https://example.org/', { maxRedirects: 3 }, { resolve: resolveTo(PUBLIC), transport: loop })).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
  });

  it('maps transport failures and timeouts to safe error codes', async () => {
    const fail: Transport = async () => {
      throw new Error('ECONNREFUSED 93.184.215.14');
    };
    await expect(safeFetch('https://example.org/', {}, { resolve: resolveTo(PUBLIC), transport: fail })).rejects.toMatchObject({ code: 'NETWORK', message: 'The request failed' });
    const slow: Transport = (_u, _a, _f, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(safeFetch('https://example.org/', { timeoutMs: 20 }, { resolve: resolveTo(PUBLIC), transport: slow })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('sniffImage', () => {
  it('recognizes JPEG, PNG and WebP by their bytes', () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
  });
  it.each([
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['HTML', '<!doctype html><html></html>'],
    ['GIF', 'GIF89a......'],
    ['PDF', '%PDF-1.7'],
    ['RIFF that is not WebP', 'RIFF\0\0\0\0WAVEfmt '],
  ])('refuses %s', (_n, body) => expect(sniffImage(Buffer.from(body, 'latin1'))).toBeNull());
});

describe('pickVariant', () => {
  it('serves the smallest variant at least as wide as requested, else the largest', () => {
    expect(pickVariant([320, 640, 960], 300)).toBe(320);
    expect(pickVariant([320, 640, 960], 640)).toBe(640);
    expect(pickVariant([320, 640, 960], 641)).toBe(960);
    expect(pickVariant([320, 640, 960], 3840)).toBe(960);
    expect(pickVariant([], 640)).toBeNull();
  });
});
