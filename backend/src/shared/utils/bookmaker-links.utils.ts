const BOOKMAKER_URL_BY_ID: Record<string, string> = {
  '8': 'https://www.bet365.bet.br',
  '11': 'https://www.williamhill.com',
  '16': 'https://www.betsson.com',
  '18': 'https://www.unibet.com',
  '23': 'https://www.betfair.com/sport',
  '28': 'https://www.betway.com',
  '29': 'https://www.bet9ja.com',
  '30': 'https://www.bwin.com',
  '33': 'https://www.betano.bet.br',
  '36': 'https://www.1xbet.com',
  '41': 'https://www.10bet.com',
  '52': 'https://www.pinnacle.com',
  '61': 'https://www.marathonbet.com',
  '79': 'https://www.bodog.eu',
  '96': 'https://www.888sport.com',
  '97': 'https://www.betclic.com',
  '129': 'https://www.stake.com/sports',
};

const BOOKMAKER_URL_BY_NAME: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /bet365/i, url: 'https://www.bet365.bet.br' },
  { pattern: /betano/i, url: 'https://www.betano.bet.br' },
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
];

export function resolveBookmakerUrl(bookmakerName?: string, bookmakerId?: string | number): string | undefined {
  const normalizedId = bookmakerId !== undefined && bookmakerId !== null
    ? String(bookmakerId)
    : undefined;

  if (normalizedId && BOOKMAKER_URL_BY_ID[normalizedId]) {
    return BOOKMAKER_URL_BY_ID[normalizedId];
  }

  const name = String(bookmakerName ?? '').trim();
  if (!name) return undefined;

  const byName = BOOKMAKER_URL_BY_NAME.find((entry) => entry.pattern.test(name));
  if (byName) return byName.url;

  return undefined;
}
