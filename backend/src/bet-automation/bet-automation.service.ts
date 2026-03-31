import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { mkdir, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { BookmakerCredentialsService } from '../bookmaker-credentials/bookmaker-credentials.service';
import { RunBetanoBetDto } from './application/dtos/run-betano-bet.dto';
import { RunBookmakerAutomationDto } from './application/dtos/run-bookmaker-automation.dto';
import { BookmakerProvider } from '../bookmaker-credentials/domain/entities/bookmaker-credentials.entity';

type SupportedAutomationProvider = Extract<BookmakerProvider, 'betano' | 'bet365'>;

type ManualSessionState = {
  sessionId: string;
  userId: string;
  provider: SupportedAutomationProvider;
  context: any;
  userDataDir: string;
  startedAt: Date;
  loginUrl: string;
};

type BrowserPage = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  fill: (selector: string, value: string, options?: Record<string, unknown>) => Promise<void>;
  click: (selector: string, options?: Record<string, unknown>) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  locator: (selector: string) => { first: () => { click: () => Promise<void> } };
  frames?: () => any[];
  screenshot?: (options: Record<string, unknown>) => Promise<unknown>;
  content?: () => Promise<string>;
};

@Injectable()
export class BetAutomationService {
  private readonly logger = new Logger(BetAutomationService.name);
  private readonly activeManualSessions = new Map<string, ManualSessionState>();

  constructor(private readonly bookmakerCredentialsService: BookmakerCredentialsService) {}

  private getSessionDir(userId: string, provider: SupportedAutomationProvider): string {
    return join(process.cwd(), 'tmp', 'playwright-sessions', provider, userId);
  }

  private findActiveManualSession(userId: string, provider: SupportedAutomationProvider): ManualSessionState | undefined {
    return Array.from(this.activeManualSessions.values()).find(
      (session) => session.userId === userId && session.provider === provider,
    );
  }

  private getContextOptions(): Record<string, unknown> {
    return {
      locale: process.env.PLAYWRIGHT_LOCALE || 'pt-BR',
      timezoneId: process.env.PLAYWRIGHT_TIMEZONE || 'America/Sao_Paulo',
      colorScheme: 'light',
      viewport: { width: 1366, height: 768 },
      userAgent:
        process.env.PLAYWRIGHT_USER_AGENT
        || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    };
  }

  private getSearchTargets(page: BrowserPage): any[] {
    const frames = typeof page.frames === 'function' ? page.frames() : [];
    return [page, ...frames];
  }

  private async fillFirstAvailable(
    page: BrowserPage,
    selectors: string[],
    value: string,
    timeout = 1200,
  ): Promise<boolean> {
    const targets = this.getSearchTargets(page);
    for (const target of targets) {
      for (const selector of selectors) {
        try {
          await target.fill(selector, value, { timeout });
          return true;
        } catch {
          // Try next selector/target.
        }
      }
    }
    return false;
  }

  private async clickFirstAvailable(
    page: BrowserPage,
    selectors: string[],
    timeout = 1500,
  ): Promise<boolean> {
    const targets = this.getSearchTargets(page);
    for (const target of targets) {
      for (const selector of selectors) {
        try {
          await target.click(selector, { timeout });
          return true;
        } catch {
          // Try next selector/target.
        }
      }
    }
    return false;
  }

  private async saveDebugArtifacts(page: BrowserPage, executionId: string, stage: string): Promise<{ screenshotPath?: string; htmlPath?: string }> {
    const baseDir = join(process.cwd(), 'tmp', 'automation-debug');
    const stamp = `${executionId}-${stage}-${Date.now()}`;
    const screenshotPath = join(baseDir, `${stamp}.png`);
    const htmlPath = join(baseDir, `${stamp}.html`);

    try {
      await mkdir(baseDir, { recursive: true });
      if (typeof page.screenshot === 'function') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      }
      if (typeof page.content === 'function') {
        const html = await page.content();
        await writeFile(htmlPath, html, 'utf8');
      }
      return { screenshotPath, htmlPath };
    } catch {
      return {};
    }
  }

  private async detectRestrictedAccess(page: BrowserPage): Promise<boolean> {
    if (typeof page.content !== 'function') return false;

    try {
      const html = (await page.content()).toLowerCase();
      return html.includes('access to this page is restricted due to security and compliance measures')
        || html.includes('betano splash screen')
        || html.includes('landingpages.kaizengaming.com/betano-splash-screen');
    } catch {
      return false;
    }
  }

  private async detectBet365RestrictedAccess(page: BrowserPage): Promise<boolean> {
    if (typeof page.content !== 'function') return false;

    try {
      const html = (await page.content()).toLowerCase();
      return html.includes('forbidden')
        || html.includes('access denied')
        || html.includes('restricted')
        || html.includes('cloudflare')
        || html.includes('attention required')
        || html.includes('sorry, you have been blocked');
    } catch {
      return false;
    }
  }

  private hasUsableEventUrl(url?: string): boolean {
    const value = String(url || '').trim();
    if (!value) return false;

    try {
      const parsed = new URL(value);
      const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      return !(path === '/' || path === '/sport' || path === '/sports');
    } catch {
      return false;
    }
  }

  private async recoverBetanoHomepage(page: BrowserPage, addStep: (message: string) => void): Promise<void> {
    const clickedLaunchHomepage = await this.clickFirstAvailable(page, [
      'button:has-text("Launch Homepage")',
      'a:has-text("Launch Homepage")',
      'button:has-text("Ir para homepage")',
      'a:has-text("Ir para homepage")',
      'button:has-text("Homepage")',
      'a:has-text("Homepage")',
    ]);

    if (clickedLaunchHomepage) {
      addStep('Recovered Betano navigation by opening the homepage from the fallback page');
      await page.waitForTimeout(1500);
    }
  }

  private normalizeTeamSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildTeamSearchVariants(teamName: string): string[] {
    const normalized = this.normalizeTeamSearchText(teamName);
    if (!normalized) return [];

    const stopwords = new Set([
      'ac', 'ca', 'cd', 'cf', 'fc', 'sc', 'club', 'clube', 'de', 'da', 'do', 'del', 'deportivo', 'atletico', 'athletico',
    ]);

    const tokens = normalized
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean);
    const significantTokens = tokens.filter((token) => token.length >= 3 && !stopwords.has(token.toLowerCase()));

    const variants: string[] = [];
    const add = (value?: string) => {
      const candidate = String(value || '').replace(/\s+/g, ' ').trim();
      if (!candidate) return;
      if (!variants.includes(candidate)) variants.push(candidate);
    };

    add(teamName);
    add(normalized);
    add(tokens.join(' '));
    add(significantTokens.join(' '));
    add(significantTokens.slice(0, 2).join(' '));
    add(significantTokens.slice(-2).join(' '));

    if (significantTokens.length > 0) {
      add(significantTokens[0]);
      add(significantTokens[significantTokens.length - 1]);
    }

    if (significantTokens.length > 1) {
      for (let index = 0; index < significantTokens.length - 1; index += 1) {
        add(`${significantTokens[index]} ${significantTokens[index + 1]}`);
      }
    }

    if (tokens.length > 1) {
      add(tokens.slice(0, 2).join(' '));
      add(tokens.slice(-2).join(' '));
    }

    return variants;
  }

  private buildBetanoSearchQueries(homeTeamName: string, awayTeamName: string): string[] {
    const uniq = (items: string[]): string[] => {
      const output: string[] = [];
      for (const item of items) {
        const normalized = item.trim();
        if (!normalized) continue;
        if (!output.includes(normalized)) output.push(normalized);
      }
      return output;
    };

    const homeVariants = this.buildTeamSearchVariants(homeTeamName);
    const awayVariants = this.buildTeamSearchVariants(awayTeamName);
    const homeShort = homeVariants.slice(0, 4);
    const awayShort = awayVariants.slice(0, 4);

    const combined: string[] = [
      `${homeTeamName} ${awayTeamName}`,
      `${awayTeamName} ${homeTeamName}`,
    ];

    for (const homeVariant of homeShort) {
      combined.push(homeVariant);
      for (const awayVariant of awayShort) {
        combined.push(`${homeVariant} ${awayVariant}`);
        combined.push(`${awayVariant} ${homeVariant}`);
      }
    }

    for (const awayVariant of awayShort) {
      combined.push(awayVariant);
    }

    return uniq(combined);
  }

  private async resolveBetanoEventByTeams(
    page: BrowserPage,
    homeTeamName: string,
    awayTeamName: string,
    addStep: (message: string) => void,
  ): Promise<boolean> {
    const home = String(homeTeamName || '').trim();
    const away = String(awayTeamName || '').trim();
    if (!home || !away) return false;

    await page.goto('https://www.betano.bet.br', { waitUntil: 'domcontentloaded', timeout: 60000 });
    addStep('Opened Betano homepage for team-based event resolution');
    await this.recoverBetanoHomepage(page, addStep);
    await page.waitForTimeout(400);

    const openedSearch = await this.clickFirstAvailable(page, [
      'button[aria-label*="buscar" i]',
      'button[aria-label*="search" i]',
      '[data-qa*="search-trigger"]',
      '[data-qa*="search-button"]',
      '[data-testid*="search-trigger"]',
      '[data-testid*="search-button"]',
      'button:has-text("Buscar")',
      'button:has-text("Search")',
    ], 500);

    if (openedSearch) {
      addStep('Opened Betano search UI');
      await page.waitForTimeout(250);
    }

    const searchSelectors = [
      'input[type="search"]',
      'input[aria-label*="buscar" i]',
      'input[aria-label*="search" i]',
      'input[placeholder*="buscar" i]',
      'input[placeholder*="search" i]',
      '[data-qa*="search"] input',
      '[data-testid*="search"] input',
    ];

    const uniq = (items: string[]): string[] => {
      const output: string[] = [];
      for (const item of items) {
        const normalized = item.trim();
        if (!normalized) continue;
        if (!output.includes(normalized)) output.push(normalized);
      }
      return output;
    };

    const collectTokens = (variants: string[]): string[] => {
      const tokens: string[] = [];
      for (const variant of variants) {
        const parts = this.normalizeTeamSearchText(variant)
          .split(' ')
          .map((part) => part.trim())
          .filter((part) => part.length >= 3);

        for (const part of parts) {
          if (!tokens.includes(part)) tokens.push(part);
        }
      }
      return tokens.slice(0, 8);
    };

    const homeTokens = collectTokens(this.buildTeamSearchVariants(home));
    const awayTokens = collectTokens(this.buildTeamSearchVariants(away));
    const queries = this.buildBetanoSearchQueries(home, away);

    addStep(`Generated ${queries.length} Betano search query variations for matchup resolution`);

    for (const query of queries) {
      const filled = await this.fillFirstAvailable(page, searchSelectors, query, 250);
      if (!filled) {
        addStep(`Betano search input not found for query: ${query}`);
        continue;
      }

      addStep(`Searching Betano event by teams: ${query}`);
      await page.waitForTimeout(450);

      const directEventTextSelectors = uniq([
        `.search-result[data-qa^="search_result_"]:has(.search-result__info__name:has-text("${home}")):has(.search-result__info__name:has-text("${away}"))`,
        `.search-result[data-qa^="search_result_"]:has(.search-result__info__name:has-text("${away}")):has(.search-result__info__name:has-text("${home}"))`,
        `.search-result:has(.search-result__info__name:has-text("${home}")):has(.search-result__info__name:has-text("${away}"))`,
        `.search-result:has(.search-result__info__name:has-text("${away}")):has(.search-result__info__name:has-text("${home}"))`,
        `.search-result__info__name:has-text("${home}"):has-text("${away}")`,
        `.search-result__info__name:has-text("${away}"):has-text("${home}")`,
        `a:has-text("${home} - ${away}")`,
        `a:has-text("${away} - ${home}")`,
        `button:has-text("${home} - ${away}")`,
        `button:has-text("${away} - ${home}")`,
        `[role="option"]:has-text("${home} - ${away}")`,
        `[role="option"]:has-text("${away} - ${home}")`,
        `div:has-text("${home} - ${away}")`,
        `div:has-text("${away} - ${home}")`,
        `[role="dialog"] div:has-text("${home}"):has-text("${away}")`,
        `[role="dialog"] div:has-text("${away}"):has-text("${home}")`,
        `div:has-text("${home}"):has-text("${away}")`,
        `div:has-text("${away}"):has-text("${home}")`,
      ]);

      const clickedDirectEvent = directEventTextSelectors.length > 0
        ? await this.clickFirstAvailable(page, directEventTextSelectors, 500)
        : false;

      if (clickedDirectEvent) {
        await page.waitForTimeout(700);
        addStep('Resolved event by exact matchup text on Betano search results');
        return true;
      }

      const clicked = await this.clickFirstAvailable(page, [
        `a:has-text("${home}")`,
        `button:has-text("${home}")`,
        `a:has-text("${away}")`,
        `button:has-text("${away}")`,
        `div:has-text("${home}"):has-text("AO VIVO")`,
        `div:has-text("${away}"):has-text("AO VIVO")`,
        `div:has-text("${home}"):has-text(" - ")`,
        `div:has-text("${away}"):has-text(" - ")`,
        `a:has-text(" - ")`,
        `button:has-text(" - ")`,
        `[role="option"]:has-text(" - ")`,
        `a:has-text("AO VIVO")`,
        `button:has-text("AO VIVO")`,
        `[role="option"]:has-text("AO VIVO")`,
      ], 700);

      if (!clicked) {
        const tokenSelectors = uniq([
          ...homeTokens.flatMap((token) => [
            `a:has-text("${token}")`,
            `button:has-text("${token}")`,
            `[role="option"]:has-text("${token}")`,
          ]),
          ...awayTokens.flatMap((token) => [
            `a:has-text("${token}")`,
            `button:has-text("${token}")`,
            `[role="option"]:has-text("${token}")`,
          ]),
        ]);

        const clickedByToken = tokenSelectors.length > 0
          ? await this.clickFirstAvailable(page, tokenSelectors, 500)
          : false;

        if (clickedByToken) {
          await page.waitForTimeout(700);
          addStep('Resolved event by tokenized team search on Betano');
          return true;
        }
      }

      const clickedFirstResult = await this.clickFirstAvailable(page, [
        '.search-result[data-qa="search_result_0"]',
        '.search-result[data-qa^="search_result_"]',
        '.search-result__info__name',
        '[data-qa*="search-results"] a',
        '[data-qa*="search-results"] button',
        '[data-testid*="search-results"] a',
        '[data-testid*="search-results"] button',
        '[role="option"] a',
        '[role="option"] button',
        '[role="option"]',
      ], 500);

      if (clickedFirstResult) {
        await page.waitForTimeout(700);
        addStep('Resolved event by clicking first Betano search result');
        return true;
      }

      if (clicked) {
        await page.waitForTimeout(700);
        addStep('Resolved event by team search on Betano');
        return true;
      }

      addStep(`Betano search returned no clickable result for query: ${query}`);
    }

    return false;
  }

  private buildBetanoSelectionCandidates(
    selectionText: string,
    homeTeamName?: string,
    awayTeamName?: string,
  ): string[] {
    const raw = String(selectionText || '').trim();
    const lower = raw.toLowerCase();
    const home = String(homeTeamName || '').trim();
    const away = String(awayTeamName || '').trim();

    const candidates: string[] = [];
    const add = (value?: string) => {
      const normalized = String(value || '').trim();
      if (!normalized) return;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    add(raw);

    const normalizedOutcome = raw
      .replace(/^1x2\s*/i, '')
      .replace(/^goals\s*over\s*\/\s*under\s*/i, '')
      .replace(/^goals\s*over\s*under\s*/i, '')
      .trim();

    add(normalizedOutcome);

    if (lower.includes('draw')) {
      add('Empate');
      add('Draw');
      add('X');
    }

    if (lower.includes('home')) {
      add(home);
      add('Casa');
      add('1');
    }

    if (lower.includes('away')) {
      add(away);
      add('Fora');
      add('2');
    }

    const overMatch = lower.match(/over\s*([0-9]+(?:[\.,][0-9]+)?)/i);
    if (overMatch?.[1]) {
      const line = overMatch[1].replace(',', '.');
      add(`Over ${line}`);
      add(`Mais de ${line}`);
      add(`Acima de ${line}`);
    }

    const underMatch = lower.match(/under\s*([0-9]+(?:[\.,][0-9]+)?)/i);
    if (underMatch?.[1]) {
      const line = underMatch[1].replace(',', '.');
      add(`Under ${line}`);
      add(`Menos de ${line}`);
      add(`Abaixo de ${line}`);
    }

    return candidates;
  }

  private buildBetanoMarketCandidates(selectionText: string): string[] {
    const raw = String(selectionText || '').trim();
    const lower = raw.toLowerCase();
    const candidates: string[] = [];

    const add = (value?: string) => {
      const normalized = String(value || '').trim();
      if (!normalized) return;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    if (/^(1|2|x)$/i.test(raw) || lower.includes('draw') || lower.includes('home') || lower.includes('away')) {
      add('Resultado Final');
    }

    if (lower.includes('qualif')) {
      add('Qualificar-se');
    }

    if (lower.includes('tempo regulamentar') || lower.includes('penalt') || lower.includes('pênalt')) {
      add('Método de qualificação');
    }

    if (lower.includes('over') || lower.includes('under') || lower.includes('mais de') || lower.includes('menos de')) {
      if (lower.includes('escante')) {
        add('Escanteios Mais/Menos');
      } else {
        add('Total de Gols Mais/Menos');
        add('Total de gols Mais/Menos - 1° Tempo');
      }
    }

    if (lower.includes('ambas') || lower.includes('both teams') || lower === 'sim' || lower === 'não' || lower === 'nao') {
      add('Ambas equipes Marcam');
    }

    if (lower.includes('draw no bet') || lower.includes('empate anula')) {
      add('Empate Anula');
    }

    if (lower.includes('chance dupla') || lower.includes('double chance')) {
      add('Chance Dupla');
    }

    return candidates;
  }

  private escapeSelectorText(value: string): string {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  private async clickBetanoSelection(
    page: BrowserPage,
    selectionText: string,
    homeTeamName: string,
    awayTeamName: string,
    addStep: (message: string) => void,
  ): Promise<boolean> {
    const candidates = this.buildBetanoSelectionCandidates(selectionText, homeTeamName, awayTeamName);
    const marketCandidates = this.buildBetanoMarketCandidates(selectionText);

    addStep(`Trying Betano selection candidates: ${candidates.join(' | ')}`);

    if (marketCandidates.length > 0) {
      addStep(`Trying Betano market candidates: ${marketCandidates.join(' | ')}`);
    }

    const directSelectors: string[] = [];
    for (const candidate of candidates) {
      const escapedCandidate = this.escapeSelectorText(candidate);
      directSelectors.push(
        `[data-qa="event-selection"][aria-label*="${escapedCandidate}"]`,
        `[data-qa="event-selection"]:has(.s-name:has-text("${escapedCandidate}"))`,
      );

      for (const market of marketCandidates) {
        const escapedMarket = this.escapeSelectorText(market);
        directSelectors.push(
          `.markets__market:has-text("${escapedMarket}") [data-qa="event-selection"][aria-label*="${escapedCandidate}"]`,
          `.markets__market:has-text("${escapedMarket}") [data-qa="event-selection"]:has(.s-name:has-text("${escapedCandidate}"))`,
        );
      }
    }

    const clickedBySelector = directSelectors.length > 0
      ? await this.clickFirstAvailable(page, directSelectors, 700)
      : false;

    if (clickedBySelector) {
      addStep('Selected market option via Betano event-selection button');
      return true;
    }

    for (const candidate of candidates) {
      try {
        const pageLocator = page as any;
        await pageLocator.locator(`[data-qa="event-selection"]`).locator(`text=${candidate}`).first().click();
        addStep(`Selected market option via candidate: ${candidate}`);
        return true;
      } catch {
        // Try next candidate.
      }
    }

    return false;
  }

  private getLaunchOptions(): Record<string, unknown> {
    const proxyServer = process.env.PLAYWRIGHT_PROXY_SERVER;
    const proxyUsername = process.env.PLAYWRIGHT_PROXY_USERNAME;
    const proxyPassword = process.env.PLAYWRIGHT_PROXY_PASSWORD;

    return {
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
      proxy: proxyServer
        ? {
            server: proxyServer,
            username: proxyUsername || undefined,
            password: proxyPassword || undefined,
          }
        : undefined,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--lang=pt-BR',
      ],
    };
  }

  private async newRealisticContext(browser: any): Promise<any> {
    return browser.newContext(this.getContextOptions());
  }

  private async hasSavedSession(userId: string, provider: SupportedAutomationProvider): Promise<boolean> {
    try {
      const files = await readdir(this.getSessionDir(userId, provider));
      return files.length > 0;
    } catch {
      return false;
    }
  }

  private async launchPersistentContext(
    playwright: any,
    userId: string,
    provider: SupportedAutomationProvider,
    forceHeaded = false,
  ): Promise<any> {
    const userDataDir = this.getSessionDir(userId, provider);
    await mkdir(userDataDir, { recursive: true });

    const launchOptions = this.getLaunchOptions();
    return playwright.chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      ...this.getContextOptions(),
      headless: forceHeaded ? false : launchOptions.headless,
    });
  }

  private async createRuntime(playwright: any, userId: string, provider: SupportedAutomationProvider): Promise<{
    mode: 'persistent' | 'ephemeral';
    browser?: any;
    context: any;
    page: BrowserPage;
  }> {
    if (this.findActiveManualSession(userId, provider)) {
      throw new BadRequestException(`A manual session for ${provider} is already open. Complete or cancel it before running automation.`);
    }

    if (await this.hasSavedSession(userId, provider)) {
      const context = await this.launchPersistentContext(playwright, userId, provider);
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      return { mode: 'persistent', context, page };
    }

    const browser = await playwright.chromium.launch(this.getLaunchOptions());
    const context = await this.newRealisticContext(browser);
    const page = await context.newPage();
    return { mode: 'ephemeral', browser, context, page };
  }

  private async closeRuntime(runtime: {
    mode: 'persistent' | 'ephemeral';
    browser?: any;
    context: any;
  }): Promise<void> {
    if (runtime.mode === 'persistent') {
      await runtime.context.close();
      return;
    }

    await runtime.browser?.close();
  }

  async getSessionStatus(userId: string, provider: SupportedAutomationProvider): Promise<Record<string, unknown>> {
    const active = this.findActiveManualSession(userId, provider);
    return {
      provider,
      activeManualSession: Boolean(active),
      activeSessionId: active?.sessionId,
      startedAt: active?.startedAt,
      hasSavedSession: await this.hasSavedSession(userId, provider),
      sessionDir: this.getSessionDir(userId, provider),
    };
  }

  async startManualSession(userId: string, provider: SupportedAutomationProvider): Promise<Record<string, unknown>> {
    const existing = this.findActiveManualSession(userId, provider);
    if (existing) {
      return {
        ok: true,
        provider,
        sessionId: existing.sessionId,
        alreadyOpen: true,
        startedAt: existing.startedAt,
        loginUrl: existing.loginUrl,
        instructions: [
          'A manual session is already open.',
          'Complete login in the opened browser window.',
          'Then call the complete endpoint to persist the session.',
        ],
      };
    }

    let playwright: any;
    try {
      playwright = await import('playwright');
    } catch {
      throw new BadRequestException('Playwright not installed. Run: npm install playwright');
    }

    const credentials = await this.bookmakerCredentialsService.getDecryptedForAutomation(userId, provider);
    const loginUrl = credentials.loginUrl
      || (provider === 'bet365' ? 'https://www.bet365.bet.br' : 'https://www.betano.bet.br');
    const sessionId = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const context = await this.launchPersistentContext(playwright, userId, provider, true);
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const state: ManualSessionState = {
      sessionId,
      userId,
      provider,
      context,
      userDataDir: this.getSessionDir(userId, provider),
      startedAt: new Date(),
      loginUrl,
    };

    this.activeManualSessions.set(sessionId, state);
    this.logger.log(`[manual-session][${sessionId}] opened for ${provider} | user=${userId}`);

    return {
      ok: true,
      provider,
      sessionId,
      loginUrl,
      sessionDir: state.userDataDir,
      instructions: [
        'A browser window was opened with a persistent profile.',
        'Log in manually and solve any anti-bot or Cloudflare challenge.',
        'When the account is logged in, call POST /bet-automation/manual-session/' + sessionId + '/complete.',
      ],
    };
  }

  async completeManualSession(userId: string, sessionId: string): Promise<Record<string, unknown>> {
    const session = this.activeManualSessions.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new BadRequestException('Manual session not found');
    }

    await session.context.close();
    this.activeManualSessions.delete(sessionId);
    this.logger.log(`[manual-session][${sessionId}] completed and persisted`);

    return {
      ok: true,
      provider: session.provider,
      sessionId,
      persisted: true,
      sessionDir: session.userDataDir,
      completedAt: new Date(),
    };
  }

  async clearSavedSession(userId: string, provider: SupportedAutomationProvider): Promise<Record<string, unknown>> {
    const active = this.findActiveManualSession(userId, provider);
    if (active) {
      await active.context.close();
      this.activeManualSessions.delete(active.sessionId);
    }

    await rm(this.getSessionDir(userId, provider), { recursive: true, force: true });

    return {
      ok: true,
      provider,
      cleared: true,
    };
  }

  async listProviders(userId: string): Promise<Array<{
    provider: BookmakerProvider;
    label: string;
    automationAvailable: boolean;
    isConfigured: boolean;
    hasCredentials: boolean;
    hasSavedSession: boolean;
    activeManualSession: boolean;
  }>> {
    const providers = this.bookmakerCredentialsService.getSupportedProviders();
    const configured = await this.bookmakerCredentialsService.listForUser(userId);
    const configuredSet = new Set(
      configured.filter((c) => c.hasUsername && c.hasPassword).map((c) => c.provider),
    );

    return Promise.all(
      providers.map(async (provider) => {
        const supportsAutomation = provider === 'betano' || provider === 'bet365';
        const activeSession = supportsAutomation
          ? this.findActiveManualSession(userId, provider as SupportedAutomationProvider)
          : undefined;

        return {
          provider,
          label: provider.toUpperCase(),
          automationAvailable: supportsAutomation,
          isConfigured: configuredSet.has(provider),
          hasCredentials: configuredSet.has(provider),
          hasSavedSession: supportsAutomation
            ? await this.hasSavedSession(userId, provider as SupportedAutomationProvider)
            : false,
          activeManualSession: Boolean(activeSession),
        };
      }),
    );
  }

  async run(userId: string, dto: RunBookmakerAutomationDto): Promise<Record<string, unknown>> {
    const rawProvider = String(dto.provider || '').trim().toLowerCase();
    const provider = rawProvider.includes('betano')
      ? 'betano'
      : rawProvider.includes('bet365')
        ? 'bet365'
        : rawProvider;

    if (provider === 'betano') {
      return this.runBetano(userId, dto);
    }

    if (provider === 'bet365') {
      return this.runBet365(userId, dto);
    }

    throw new BadRequestException(`Automation for provider "${dto.provider}" is not implemented yet`);
  }

  async runBet365(
    userId: string,
    dto: Pick<RunBookmakerAutomationDto, 'eventUrl' | 'selectionText' | 'stake' | 'dryRun' | 'confirmRealBet'>,
  ): Promise<Record<string, unknown>> {
    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();
    const credentials = await this.bookmakerCredentialsService.getDecryptedForAutomation(userId, 'bet365');

    const allowRealBetting = process.env.ALLOW_REAL_BETTING === 'true';
    const isDryRun = dto.dryRun !== false;
    const canPlaceRealBet = !isDryRun && dto.confirmRealBet === true && allowRealBetting;

    const steps: string[] = [];
    const addStep = (message: string) => {
      steps.push(message);
      this.logger.log(`[bet365-automation][${executionId}] ${message}`);
    };

    this.logger.log(
      `[bet365-automation][${executionId}] started | user=${userId} | dryRun=${isDryRun} | eventUrl=${dto.eventUrl}`,
    );

    let playwright: { chromium: { launch: (options: Record<string, unknown>) => Promise<any> } };
    try {
      playwright = await import('playwright');
    } catch {
      throw new BadRequestException('Playwright not installed. Run: npm install playwright');
    }

    let runtime: { mode: 'persistent' | 'ephemeral'; browser?: any; context: any; page: BrowserPage };
    try {
      runtime = await this.createRuntime(playwright, userId, 'bet365');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Executable doesn\'t exist')) {
        throw new BadRequestException('Playwright browser is not installed. Run in backend: npx playwright install chromium');
      }
      throw new BadRequestException(`Failed to launch Playwright browser: ${message}`);
    }

    try {
      const page = runtime.page;
      const usingSavedSession = runtime.mode === 'persistent';

      const loginUrl = credentials.loginUrl || 'https://www.bet365.bet.br';
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      addStep('Opened Bet365 login page');

      if (await this.detectBet365RestrictedAccess(page)) {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'restricted-access');
        const details = [
          'Bet365 blocked this session with an access restriction or anti-bot page. This environment is likely being blocked by IP, region, or bot protection.',
          'Use a compliant local residential connection/VPN, non-blocked IP, and preferably headed browser validation.',
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');

        throw new BadRequestException(details);
      }

      await this.clickFirstAvailable(page, [
        'button:has-text("Aceitar")',
        'button:has-text("Accept")',
        '#onetrust-accept-btn-handler',
        '[id*="accept" i]',
      ]);
      addStep('Cookie/banner handling attempted');
      addStep(`Detected ${this.getSearchTargets(page).length} searchable frame(s)`);

      if (!usingSavedSession) {
        const openedLoginPanel = await this.clickFirstAvailable(page, [
          'button:has-text("Entrar")',
          'button:has-text("Login")',
          'button:has-text("Iniciar sessão")',
          'button:has-text("Acessar")',
          'a:has-text("Entrar")',
          'a:has-text("Login")',
          '[data-testid*="login" i]',
          '[class*="login" i]',
        ]);
        if (openedLoginPanel) {
          addStep('Opened login modal/panel');
          await page.waitForTimeout(800);
        }

        addStep('Trying to fill login credentials');
        const userFilled = await this.fillFirstAvailable(page, [
          'input[name="username"]',
          'input[name="login"]',
          'input[name="user"]',
          'input[autocomplete="username"]',
          'input[placeholder*="usuario" i]',
          'input[placeholder*="nome" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="email" i]',
          'input[aria-label*="usuario" i]',
          'input[aria-label*="login" i]',
          'input[type="email"]',
          'input[type="text"]',
        ], credentials.username);

        const passFilled = await this.fillFirstAvailable(page, [
          'input[name="password"]',
          'input[name="psw"]',
          'input[autocomplete="current-password"]',
          'input[placeholder*="senha" i]',
          'input[placeholder*="password" i]',
          'input[aria-label*="senha" i]',
          'input[aria-label*="password" i]',
          'input[type="password"]',
        ], credentials.password);

        if (!userFilled || !passFilled) {
          const artifacts = await this.saveDebugArtifacts(page, executionId, 'login-fields-not-found');
          const details = [
            'Could not locate login fields on Bet365 page',
            artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
            artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
          ].filter(Boolean).join(' | ');
          throw new BadRequestException(details);
        }

        addStep('Login fields filled');

        await this.clickFirstAvailable(page, [
          'button:has-text("Continuar")',
          'button:has-text("Proximo")',
          'button:has-text("Próximo")',
          'button:has-text("Next")',
        ]);

        const clickedLogin = await this.clickFirstAvailable(page, [
          'button[type="submit"]',
          'button:has-text("Entrar")',
          'button:has-text("Login")',
          'button:has-text("Acessar")',
          '[data-testid*="submit" i]',
        ]);

        if (!clickedLogin) {
          throw new BadRequestException('Could not locate login button on Bet365 page');
        }

        addStep('Submitted login form');
        await page.waitForTimeout(2500);
      } else {
        addStep('Using saved persistent session, skipping login automation');
      }

      await page.goto(dto.eventUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      addStep('Opened event page');

      try {
        await page.locator(`text=${dto.selectionText}`).first().click();
        addStep('Selected market option');
      } catch {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'selection-not-found');
        const details = [
          'Could not find target selection on Bet365 event page',
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      const stakeFilled = await this.fillFirstAvailable(page, [
        'input[name="stake"]',
        'input[name="betAmount"]',
        'input[inputmode="decimal"]',
        'input[placeholder*="valor" i]',
        'input[placeholder*="stake" i]',
        'input[type="number"]',
      ], String(dto.stake));

      if (!stakeFilled) {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'stake-not-found');
        const details = [
          'Could not fill stake field in Bet365 bet slip',
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      addStep('Filled stake amount');

      if (!canPlaceRealBet) {
        addStep('Dry-run mode active: skipped final confirmation click');
        const finishedAt = new Date();
        return {
          ok: true,
          executionId,
          provider: 'bet365',
          dryRun: true,
          canPlaceRealBet: false,
          reason: allowRealBetting
            ? 'Set dryRun=false and confirmRealBet=true to place a real bet'
            : 'ALLOW_REAL_BETTING is disabled on server',
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          steps,
        };
      }

      const clickedConfirm = await this.clickFirstAvailable(page, [
        'button:has-text("Aposte já")',
        'button:has-text("Aposte ja")',
        'button:has-text("Apostar")',
        'button:has-text("Aposta já")',
        'button:has-text("Aposta ja")',
        'button:has-text("Confirmar")',
        'button:has-text("Place Bet")',
      ]);

      if (!clickedConfirm) {
        throw new BadRequestException('Could not find final confirmation button in Bet365 bet slip');
      }

      addStep('Clicked final bet confirmation button');
      await page.waitForTimeout(1500);

      const finishedAt = new Date();

      return {
        ok: true,
        executionId,
        provider: 'bet365',
        dryRun: false,
        realBetPlaced: true,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        steps,
      };
    } catch (error: unknown) {
      this.logger.warn(`[bet365-automation][${executionId}] ${(error as Error).message}`);
      throw error;
    } finally {
      await this.closeRuntime(runtime);
    }
  }

  async runBetano(
    userId: string,
    dto: Pick<RunBetanoBetDto, 'eventUrl' | 'selectionText' | 'stake' | 'dryRun' | 'confirmRealBet' | 'homeTeamName' | 'awayTeamName'>,
  ): Promise<Record<string, unknown>> {
    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();
    const credentials = await this.bookmakerCredentialsService.getDecryptedForAutomation(userId, 'betano');

    const allowRealBetting = process.env.ALLOW_REAL_BETTING === 'true';
    const isDryRun = dto.dryRun !== false;
    const canPlaceRealBet = !isDryRun && dto.confirmRealBet === true && allowRealBetting;

    const steps: string[] = [];
    const addStep = (message: string) => {
      steps.push(message);
      this.logger.log(`[betano-automation][${executionId}] ${message}`);
    };

    this.logger.log(
      `[betano-automation][${executionId}] started | user=${userId} | dryRun=${isDryRun} | eventUrl=${dto.eventUrl}`,
    );

    let playwright: { chromium: { launch: (options: Record<string, unknown>) => Promise<any> } };
    try {
      playwright = await import('playwright');
    } catch {
      throw new BadRequestException('Playwright not installed. Run: npm install playwright');
    }

    let runtime: { mode: 'persistent' | 'ephemeral'; browser?: any; context: any; page: BrowserPage };
    try {
      runtime = await this.createRuntime(playwright, userId, 'betano');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Executable doesn\'t exist')) {
        throw new BadRequestException('Playwright browser is not installed. Run in backend: npx playwright install chromium');
      }
      throw new BadRequestException(`Failed to launch Playwright browser: ${message}`);
    }

    try {
      const page = runtime.page;
      const usingSavedSession = runtime.mode === 'persistent';

      const loginUrl = credentials.loginUrl || 'https://www.betano.bet.br';
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      addStep('Opened Betano login page');

      if (await this.detectRestrictedAccess(page)) {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'restricted-access');
        const details = [
          'Betano blocked this session with a security/compliance restriction page. This environment is likely being blocked by IP, region, or bot protection.',
          'Use a compliant local residential connection/VPN, non-blocked IP, and preferably headed browser validation.',
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');

        throw new BadRequestException(details);
      }

      await this.clickFirstAvailable(page, [
        'button:has-text("Aceitar")',
        'button:has-text("Accept")',
        '#onetrust-accept-btn-handler',
      ]);
      addStep('Cookie/banner handling attempted');
      addStep(`Detected ${this.getSearchTargets(page).length} searchable frame(s)`);

      if (!usingSavedSession) {
        // Betano often renders login fields only after opening a login modal/panel.
        const openedLoginPanel = await this.clickFirstAvailable(page, [
          'button:has-text("Entrar")',
          'button:has-text("Login")',
          'button:has-text("Iniciar sessao")',
          'button:has-text("Iniciar sessão")',
          'button:has-text("Acessar")',
          '[aria-label*="entrar" i]',
          '[aria-label*="login" i]',
          'a:has-text("Entrar")',
          'a:has-text("Login")',
          '[data-qa="login-button"]',
        ]);
        if (openedLoginPanel) {
          addStep('Opened login modal/panel');
          await page.waitForTimeout(800);
        }

        addStep('Trying to fill login credentials');
        const userFilled = await this.fillFirstAvailable(page, [
          'input[name="username"]',
          'input[name="login"]',
          'input[autocomplete="username"]',
          'input[placeholder*="usuario" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="email" i]',
          'input[aria-label*="usuario" i]',
          'input[aria-label*="email" i]',
          'input[type="email"]',
          'input[type="text"]',
        ], credentials.username);

        const passFilled = await this.fillFirstAvailable(page, [
          'input[name="password"]',
          'input[autocomplete="current-password"]',
          'input[placeholder*="senha" i]',
          'input[placeholder*="password" i]',
          'input[aria-label*="senha" i]',
          'input[aria-label*="password" i]',
          'input[type="password"]',
        ], credentials.password);

        if (!userFilled || !passFilled) {
          const artifacts = await this.saveDebugArtifacts(page, executionId, 'login-fields-not-found');
          const details = [
            'Could not locate login fields on Betano page',
            artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
            artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
          ].filter(Boolean).join(' | ');
          throw new BadRequestException(details);
        }

        addStep('Login fields filled');

        await this.clickFirstAvailable(page, [
          'button:has-text("Continuar")',
          'button:has-text("Proximo")',
          'button:has-text("Próximo")',
          'button:has-text("Next")',
        ]);

        const clickedLogin = await this.clickFirstAvailable(page, [
          'button[type="submit"]',
          'button:has-text("Entrar")',
          'button:has-text("Login")',
          'button:has-text("Acessar")',
          '[data-qa="login-submit"]',
        ]);

        if (!clickedLogin) {
          throw new BadRequestException('Could not locate login button on Betano page');
        }

        addStep('Submitted login form');
        await page.waitForTimeout(2500);
      } else {
        addStep('Using saved persistent session, skipping login automation');
      }

      const hasEventUrl = this.hasUsableEventUrl(dto.eventUrl);
      if (hasEventUrl) {
        await page.goto(String(dto.eventUrl), { waitUntil: 'domcontentloaded', timeout: 60000 });
        addStep('Opened event page from provided URL');
      } else {
        const resolved = await this.resolveBetanoEventByTeams(
          page,
          String(dto.homeTeamName || ''),
          String(dto.awayTeamName || ''),
          addStep,
        );

        if (!resolved) {
          throw new BadRequestException('Could not resolve Betano event automatically (missing deep link and team-search fallback failed)');
        }
      }

      const selected = await this.clickBetanoSelection(
        page,
        String(dto.selectionText || ''),
        String(dto.homeTeamName || ''),
        String(dto.awayTeamName || ''),
        addStep,
      );

      if (!selected) {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'selection-not-found');
        const details = [
          `Could not find target selection on event page (selectionText=${dto.selectionText})`,
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      const stakeFilled = await this.fillFirstAvailable(page, [
        'input[name="stake"]',
        'input[inputmode="decimal"]',
        'input[type="number"]',
      ], String(dto.stake));

      if (!stakeFilled) {
        throw new BadRequestException('Could not fill stake field in bet slip');
      }

      addStep('Filled stake amount');

      if (!canPlaceRealBet) {
        addStep('Dry-run mode active: skipped final confirmation click');
        const finishedAt = new Date();
        return {
          ok: true,
          executionId,
          provider: 'betano',
          dryRun: true,
          canPlaceRealBet: false,
          reason: allowRealBetting
            ? 'Set dryRun=false and confirmRealBet=true to place a real bet'
            : 'ALLOW_REAL_BETTING is disabled on server',
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          steps,
        };
      }

      const clickedConfirm = await this.clickFirstAvailable(page, [
        'button:has-text("Aposte já")',
        'button:has-text("Aposte ja")',
        'button:has-text("Aposta já")',
        'button:has-text("Aposta ja")',
        'button:has-text("Aposte")',
        'button:has-text("Apostar")',
        'button:has-text("Confirmar")',
        'button:has-text("Confirm")',
        'button:has-text("Place Bet")',
        '[data-qa*="place-bet"]',
        '[data-testid*="place-bet"]',
        '[data-test*="place-bet"]',
        'xpath=//button[contains(translate(normalize-space(.), "ÁÀÃÂÉÊÍÓÔÕÚÇ", "AAAAEEIOOOUC"), "APOSTE")]',
        'xpath=//button[contains(translate(normalize-space(.), "ÁÀÃÂÉÊÍÓÔÕÚÇ", "AAAAEEIOOOUC"), "APOSTAR")]',
      ]);

      if (!clickedConfirm) {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'confirm-button-not-found');
        const details = [
          'Could not find final confirmation button in bet slip',
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      addStep('Clicked final bet confirmation button');
      await page.waitForTimeout(1500);

      const finishedAt = new Date();

      return {
        ok: true,
        executionId,
        provider: 'betano',
        dryRun: false,
        realBetPlaced: true,
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        steps,
      };
    } catch (error: unknown) {
      this.logger.warn(`[betano-automation][${executionId}] ${(error as Error).message}`);
      throw error;
    } finally {
      await this.closeRuntime(runtime);
    }
  }
}
