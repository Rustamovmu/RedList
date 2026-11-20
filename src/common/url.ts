/** The host a link goes to, shown next to every outbound link (PLAN §4, §10). */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
