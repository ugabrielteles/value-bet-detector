const BOOKMAKER_LINKS: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /bet365/i, url: 'https://www.bet365.com' },
  { pattern: /betano/i, url: 'https://www.betano.com' },
  { pattern: /betfair/i, url: 'https://www.betfair.com/sport' },
  { pattern: /betway/i, url: 'https://www.betway.com' },
  { pattern: /bwin/i, url: 'https://www.bwin.com' },
  { pattern: /unibet/i, url: 'https://www.unibet.com' },
  { pattern: /pinnacle/i, url: 'https://www.pinnacle.com' },
  { pattern: /1xbet/i, url: 'https://www.1xbet.com' },
  { pattern: /marathon/i, url: 'https://www.marathonbet.com' },
  { pattern: /william hill/i, url: 'https://www.williamhill.com' },
  { pattern: /betsson/i, url: 'https://www.betsson.com' },
  { pattern: /10bet/i, url: 'https://www.10bet.com' },
  { pattern: /stake/i, url: 'https://www.stake.com/sports' },
  { pattern: /888sport/i, url: 'https://www.888sport.com' },
  { pattern: /betclic/i, url: 'https://www.betclic.com' },
]

export function getBookmakerLink(bookmaker: string, preferredUrl?: string): string | undefined {
  if (typeof preferredUrl === 'string' && preferredUrl.trim().length > 0) {
    return preferredUrl.trim()
  }

  const source = (bookmaker ?? '').trim()
  if (!source) return undefined

  return BOOKMAKER_LINKS.find((entry) => entry.pattern.test(source))?.url
}
