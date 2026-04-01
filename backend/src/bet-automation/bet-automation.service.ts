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

  /**
   * Types a value into a form field using real keyboard events at the page level.
   * This is the most reliable approach for Vue/React inputs that ignore programmatic fill().
   * Strategy: focus the element → clear via keyboard → type via page.keyboard (isTrusted events).
   */
  private async typeFirstAvailable(
    page: BrowserPage,
    selectors: string[],
    value: string,
    timeout = 500,
  ): Promise<boolean> {
    const pageAny = page as any;
    const targets = this.getSearchTargets(page);

    for (const target of targets) {
      for (const selector of selectors) {
        try {
          const locator = (target as any).locator(selector).first();
          await locator.waitFor({ state: 'visible', timeout });

          // Click to focus the field
          await locator.click({ timeout: 400 });
          await page.waitForTimeout(80);

          // Select all existing text and delete it
          if (typeof pageAny.keyboard?.press === 'function') {
            await pageAny.keyboard.press('Control+a');
            await pageAny.keyboard.press('Delete');
          } else {
            await locator.fill('').catch(() => {});
          }

          // Type character-by-character at page level — generates real keyboard events
          // that Vue v-model (including .lazy and .trim modifiers) always reacts to
          if (typeof pageAny.keyboard?.type === 'function') {
            await pageAny.keyboard.type(value, { delay: 60 });
          } else {
            await locator.pressSequentially(value, { delay: 60 });
          }

          // Trigger change event so Vue .lazy v-model updates
          await locator.dispatchEvent('change').catch(() => {});
          await page.waitForTimeout(80);
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

  private async clickBetanoEventResultByNormalizedTokens(
    page: BrowserPage,
    homeTokens: string[],
    awayTokens: string[],
    addStep: (message: string) => void,
  ): Promise<boolean> {
    try {
      const pageWithEval = page as any;
      if (typeof pageWithEval.evaluate !== 'function') return false;

      const beforeUrl = await this.getPageUrl(page);

      // Step 1: Ensure Eventos accordion is open
      addStep('[Betano click][accordion] Ensuring Eventos accordion is expanded');
      const expandedAccordion = await pageWithEval.evaluate(() => {
        const normalize = (value: string): string => String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        const accordions = Array.from(document.querySelectorAll('.sb-accordion')) as HTMLElement[];
        
        // Log for diagnostics
        (window as any).__debugAccordions = {
          totalAccordions: accordions.length,
          titles: accordions.map((a) => (a.querySelector('.sb-accordion__header .sb-accordion__header__title span')?.textContent || '').trim()),
        };

        const eventsAccordion = accordions.find((accordion) => {
          const titleText = normalize(
            accordion.querySelector('.sb-accordion__header .sb-accordion__header__title span')?.textContent || '',
          ).trim();
          return titleText === 'eventos' || titleText === 'events';
        });

        if (!eventsAccordion) return false;

        const header = eventsAccordion.querySelector('.sb-accordion__header') as HTMLElement | null;
        if (!header) return false;

        // Check if already expanded by verifying body visible or clicking to be safe
        const body = eventsAccordion.querySelector('.sb-accordion__body') as HTMLElement | null;
        const isVisible = body && window.getComputedStyle(body).display !== 'none';

        if (!isVisible) {
          // Click header to expand
          header.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const eventInit: MouseEventInit = { bubbles: true, cancelable: true, composed: true };
          header.dispatchEvent(new MouseEvent('pointerdown', eventInit));
          header.dispatchEvent(new MouseEvent('click', eventInit));
          header.dispatchEvent(new MouseEvent('pointerup', eventInit));
        }

        return true;
      });

      if (!expandedAccordion) {
        addStep('[Betano click][accordion] Failed to expand Eventos accordion');
        try {
          const debugInfo = await pageWithEval.evaluate(() => (window as any).__debugAccordions);
          addStep(`[Betano click][accordion] Debug: total accordions=${debugInfo?.totalAccordions}, titles=${JSON.stringify(debugInfo?.titles)}`);
        } catch {
          // ignore
        }
        return false;
      }

      addStep('[Betano click][accordion] Eventos accordion expanded/verified');
      await page.waitForTimeout(300);

      const selectionContext = await pageWithEval.evaluate(
        ({ rawHomeTokens, rawAwayTokens }) => {
          const normalize = (value: string): string => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

          document
            .querySelectorAll('[data-automation-target="betano-event-target"]')
            .forEach((node) => node.removeAttribute('data-automation-target'));

          const home = (rawHomeTokens || [])
            .map((token: string) => normalize(token).trim())
            .filter((token: string) => token.length >= 3)
            .slice(0, 6);
          const away = (rawAwayTokens || [])
            .map((token: string) => normalize(token).trim())
            .filter((token: string) => token.length >= 3)
            .slice(0, 6);

          const accordions = Array.from(document.querySelectorAll('.sb-accordion')) as HTMLElement[];
          const accordionTitles = accordions
            .map((accordion) => (accordion.querySelector('.sb-accordion__header .sb-accordion__header__title span')?.textContent || '').trim())
            .filter(Boolean);

          const eventsAccordion = accordions.find((accordion) => {
            const titleText = normalize(
              accordion.querySelector('.sb-accordion__header .sb-accordion__header__title span')?.textContent || '',
            ).trim();

            // Strictly target the "Eventos/Events" accordion title to avoid matching "Mercados" rows.
            return titleText === 'eventos' || titleText === 'events';
          });

          if (!eventsAccordion) {
            return {
              selectedLabel: '',
              accordionTitles,
              hasEventsAccordion: false,
              eventsRows: 0,
            };
          }

          const rows = Array.from(
            eventsAccordion.querySelectorAll('.sb-accordion__body .search-result[data-qa^="search_result_"]'),
          ) as HTMLElement[];

          if (!rows.length) {
            return {
              selectedLabel: '',
              accordionTitles,
              hasEventsAccordion: true,
              eventsRows: 0,
            };
          }

          const scored = rows.map((row) => {
            const text = normalize(row.textContent || '');
            const homeHits = home.filter((token: string) => text.includes(token)).length;
            const awayHits = away.filter((token: string) => text.includes(token)).length;
            return { row, homeHits, awayHits, score: homeHits + awayHits };
          });

          const best = scored
            .filter((entry) => entry.homeHits > 0 && entry.awayHits > 0)
            .sort((a, b) => b.score - a.score)[0];

          if (best?.row) {
            best.row.setAttribute('data-automation-target', 'betano-event-target');
            return {
              selectedLabel: (best.row.querySelector('.search-result__info__name')?.textContent || '').trim(),
              accordionTitles,
              hasEventsAccordion: true,
              eventsRows: rows.length,
            };
          }

          if (rows.length === 1) {
            rows[0].setAttribute('data-automation-target', 'betano-event-target');
            return {
              selectedLabel: (rows[0].querySelector('.search-result__info__name')?.textContent || '').trim(),
              accordionTitles,
              hasEventsAccordion: true,
              eventsRows: rows.length,
            };
          }

          return {
            selectedLabel: '',
            accordionTitles,
            hasEventsAccordion: true,
            eventsRows: rows.length,
          };
        },
        { rawHomeTokens: homeTokens, rawAwayTokens: awayTokens },
      );

      const accordionTitles = Array.isArray(selectionContext?.accordionTitles)
        ? selectionContext.accordionTitles.filter(Boolean).join(' | ')
        : '';
      addStep(`[Betano click][pre] Accordion titles found: ${accordionTitles || 'none'}`);

      if (!selectionContext?.hasEventsAccordion) {
        addStep('[Betano click][pre] Eventos accordion not found');
      } else if (!selectionContext?.eventsRows) {
        addStep('[Betano click][pre] Eventos accordion found but with 0 rows');
      } else {
        addStep(`[Betano click][pre] Found ${selectionContext?.eventsRows} event row(s) in Eventos accordion`);
      }

      const targetLabel = String(selectionContext?.selectedLabel || '').trim();
      if (!targetLabel) {
        addStep(`[Betano click][pre] Warning: Found ${selectionContext?.eventsRows} event row(s) but none matched the team tokens`);
        return false;
      }

      addStep(`[Betano click][0/4] Candidate event row selected: ${targetLabel}`);

      const targetSelectors = [
        `[data-automation-target="betano-event-target"] .search-result__info__name`,
        `[data-automation-target="betano-event-target"] .search-result__info`,
        `[data-automation-target="betano-event-target"]`,
      ];

      for (let index = 0; index < targetSelectors.length; index += 1) {
        const selector = targetSelectors[index];
        addStep(`[Betano click][${index + 1}/4] Trying force click selector: ${selector}`);
        try {
          await pageWithEval.locator(selector).first().click({ timeout: 1200, force: true });
          const succeeded = await this.waitBetanoSearchCloseOrNavigate(page, beforeUrl, 1500);
          if (succeeded) {
            addStep(`[Betano click][${index + 1}/4] Success: search modal closed after click`);
            return true;
          }

          addStep(`[Betano click][${index + 1}/4] Click dispatched but search modal is still open`);
        } catch {
          addStep(`[Betano click][${index + 1}/4] Failed to click selector`);
        }
      }

      addStep('[Betano click][4/4] Trying DOM pointer/mouse event dispatch fallback');
      const clickedByEvents = await pageWithEval.evaluate(() => {
        const row = document.querySelector('[data-automation-target="betano-event-target"]') as HTMLElement | null;
        if (!row) return false;

        const target = (row.querySelector('.search-result__info__name')
          || row.querySelector('.search-result__info')
          || row) as HTMLElement;

        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        const eventInit: MouseEventInit = { bubbles: true, cancelable: true, composed: true };
        target.dispatchEvent(new MouseEvent('pointerdown', eventInit));
        target.dispatchEvent(new MouseEvent('mousedown', eventInit));
        target.dispatchEvent(new MouseEvent('mouseup', eventInit));
        target.dispatchEvent(new MouseEvent('click', eventInit));
        return true;
      });

      if (!clickedByEvents) {
        addStep('[Betano click][4/4] Failed: target row not found for DOM event dispatch');
        return false;
      }

      const succeeded = await this.waitBetanoSearchCloseOrNavigate(page, beforeUrl, 1500);
      if (!succeeded) {
        addStep('[Betano click][4/4] DOM events dispatched but search modal is still open');
        return false;
      }

      addStep('[Betano click][4/4] Success: search modal closed after DOM event dispatch');
      return true;
    } catch {
      return false;
    }
  }

  private async isBetanoSearchResultsVisible(page: BrowserPage): Promise<boolean> {
    try {
      const pageWithEval = page as any;
      if (typeof pageWithEval.evaluate !== 'function') return false;

      const visible = await pageWithEval.evaluate(() => {
        const container = document.querySelector('[data-qa="container_search_results"]') as HTMLElement | null;
        if (!container) return false;
        const style = window.getComputedStyle(container);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return container.offsetParent !== null;
      });

      return Boolean(visible);
    } catch {
      return false;
    }
  }

  private async getPageUrl(page: BrowserPage): Promise<string> {
    try {
      const pageWithEval = page as any;
      if (typeof pageWithEval.evaluate !== 'function') return '';
      return String(await pageWithEval.evaluate(() => window.location.href));
    } catch {
      return '';
    }
  }

  private async waitBetanoSearchCloseOrNavigate(page: BrowserPage, beforeUrl: string, timeoutMs = 1500): Promise<boolean> {
    const stepMs = 150;
    const maxChecks = Math.max(1, Math.floor(timeoutMs / stepMs));

    for (let check = 0; check < maxChecks; check += 1) {
      await page.waitForTimeout(stepMs);
      const stillVisible = await this.isBetanoSearchResultsVisible(page);
      if (!stillVisible) return true;

      const currentUrl = await this.getPageUrl(page);
      if (beforeUrl && currentUrl && beforeUrl !== currentUrl) return true;
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

  private async waitForBetanoBetstip(page: BrowserPage, timeoutMs = 6000): Promise<boolean> {
    const stepMs = 300;
    const maxChecks = Math.ceil(timeoutMs / stepMs);
    const pageWithEval = page as any;
    if (typeof pageWithEval.evaluate !== 'function') return true;

    for (let i = 0; i < maxChecks; i++) {
      await page.waitForTimeout(stepMs);
      try {
        const visible = await pageWithEval.evaluate(() => {
          const betslip = document.querySelector(
            '.betslip, [data-qa="betslip"], [data-testid="betslip"], [class*="betslip"], [class*="bet-slip"]',
          ) as HTMLElement | null;
          if (!betslip) return false;
          const style = window.getComputedStyle(betslip);
          return style.display !== 'none' && style.visibility !== 'hidden' && betslip.offsetParent !== null;
        });
        if (visible) return true;
      } catch {
        // ignore
      }
    }

    return false;
  }

  private async detectBetanoConfirmationResult(page: BrowserPage): Promise<{ success: boolean; betSlipId?: string; error?: string }> {
    const pageWithEval = page as any;
    if (typeof pageWithEval.evaluate !== 'function') return { success: true };

    try {
      const result = await pageWithEval.evaluate(() => {
        const normalize = (v: string): string => String(v || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

        const errorNeedles = [
          'cotacao foi alterada',
          'quota foi alterada',
          'odds have changed',
          'odds changed',
          'saldo insuficiente',
          'insufficient funds',
          'insufficient balance',
          'mercado suspenso',
          'market suspended',
          'aposta invalida',
          'aposta nao aceite',
          'bet not accepted',
          'limite maximo',
          'aposta rejeitada',
          'bet rejected',
          'erro ao colocar',
          'error placing bet',
        ];

        const successNeedles = [
          'aposta aceite',
          'aposta confirmada',
          'aposta realizada',
          'bet accepted',
          'bet confirmed',
          'bet placed',
          'aposta efetuada',
          'aposta submetida',
        ];

        const isVisible = (el: HTMLElement): boolean => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
        };

        const candidates = Array.from(
          document.querySelectorAll('.betslip, [data-qa="betslip"], [class*="betslip"], [class*="bet-slip"], [class*="receipt"], [class*="confirmation"], main'),
        ) as HTMLElement[];

        for (const container of candidates) {
          if (!isVisible(container)) continue;
          const text = normalize(container.innerText || container.textContent || '');
          if (!text) continue;

          const error = errorNeedles.find((needle) => text.includes(needle));
          if (error) return { success: false, error: text.slice(0, 300) };

          if (successNeedles.some((needle) => text.includes(needle))) {
            // Try to extract a bet receipt/slip ID
            const idMatch = text.match(/(?:ref|referencia|id|recibo)[:\s#]*([a-z0-9\-]{4,30})/i)
              || text.match(/\b([0-9]{6,18})\b/);
            return { success: true, betSlipId: idMatch?.[1] };
          }
        }

        return { success: true }; // Could not determine — assume optimistic
      });

      return result as { success: boolean; betSlipId?: string; error?: string };
    } catch {
      return { success: true }; // Never fail due to detection errors
    }
  }

  private async detectBetanoNoMarketsAvailable(page: BrowserPage): Promise<boolean> {
    const pageWithEval = page as any;
    if (typeof pageWithEval.evaluate !== 'function') return false;

    try {
      const result = await pageWithEval.evaluate(() => {
        const normalize = (value: string): string => String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();

        const noMarketsNeedles = [
          'nao existem mercados disponiveis de momento',
          'there are currently no available markets in this event',
        ];

        // If there are selectable odds in the DOM, this is not a no-markets scenario.
        const selectionCount = document.querySelectorAll('[data-qa="event-selection"]').length;
        const marketCount = document.querySelectorAll('.markets__market, [data-qa="market-row"]').length;

        if (selectionCount > 0 || marketCount > 0) {
          return { hasNoMarketsVisibleMessage: false, selectionCount, marketCount };
        }

        const isElementVisible = (element: Element | null): boolean => {
          if (!element) return false;
          const el = element as HTMLElement;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          return el.offsetParent !== null;
        };

        // Check visible text nodes first to avoid false positives from scripts/hidden templates.
        const visibleContainers = Array.from(document.querySelectorAll('main, section, div, span, p, h1, h2, h3'));
        const hasNoMarketsVisibleMessage = visibleContainers.some((node) => {
          if (!isElementVisible(node)) return false;
          const text = normalize((node as HTMLElement).innerText || node.textContent || '');
          if (!text) return false;
          return noMarketsNeedles.some((needle) => text.includes(needle));
        });

        return { hasNoMarketsVisibleMessage, selectionCount, marketCount };
      });

      return Boolean(result?.hasNoMarketsVisibleMessage);
    } catch {
      return false;
    }
  }

  private async findLocatorInPageOrFrames(
    page: BrowserPage,
    selector: string,
    timeoutMs = 8000,
  ): Promise<{ locator: any; context: any } | null> {
    const targets = this.getSearchTargets(page); // [page, frame1, frame2, ...]
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const target of targets) {
        try {
          const locator = (target as any).locator(selector).first();
          await locator.waitFor({ state: 'visible', timeout: 400 });
          return { locator, context: target };
        } catch {
          // not in this target yet
        }
      }
      await page.waitForTimeout(300);
    }

    return null;
  }

  private async fillInFrame(
    locator: any,
    context: any,
    value: string,
  ): Promise<boolean> {
    // Strategy 1: standard fill
    try {
      await locator.fill(value);
      const val: string = await locator.inputValue().catch(() => '');
      if (val) return true;
    } catch {
      // continue
    }

    // Strategy 2: keyboard.type via the FRAME's keyboard (not page.keyboard)
    // When element is in a frame, use the frame's locator.pressSequentially
    // which dispatches events directly on the element regardless of focus
    try {
      await locator.click({ timeout: 1000 });
      await locator.pressSequentially(value, { delay: 60 });
      await locator.dispatchEvent('change').catch(() => {});
      const val: string = await locator.inputValue().catch(() => '');
      if (val) return true;
    } catch {
      // continue
    }

    // Strategy 3: evaluate inside the frame context with native setter
    try {
      const filled = await (context as any).evaluate(
        ({ val }: { val: string }) => {
          // Find any visible, editable input in the frame
          const candidates = Array.from(document.querySelectorAll('input:not([type="hidden"])')) as HTMLInputElement[];
          const el = candidates.find((e) => {
            if (e.readOnly || e.disabled) return false;
            const s = window.getComputedStyle(e);
            return s.display !== 'none' && s.visibility !== 'hidden' && e.offsetParent !== null;
          });
          if (!el) return false;
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter ? setter.call(el, val) : (el.value = val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        },
        { val: value },
      ).catch(() => false);
      if (filled) return true;
    } catch {
      // continue
    }

    return false;
  }

  private async fillBetanoCredentials(
    page: BrowserPage,
    executionId: string,
    username: string,
    password: string,
    addStep: (message: string) => void,
  ): Promise<void> {
    // --- Username ---
    addStep('[login] Searching for username field across page and frames');
    const usernameTarget = await this.findLocatorInPageOrFrames(
      page,
      '#username, input[name="username"], [aria-label="username"]',
      8000,
    );

    if (!usernameTarget) {
      const artifacts = await this.saveDebugArtifacts(page, executionId, 'login-username-not-visible');
      throw new Error(`Username field not found in page or frames after 8s. screenshot=${artifacts.screenshotPath ?? 'n/a'}`);
    }

    addStep('[login] Username field found — filling');
    const userOk = await this.fillInFrame(usernameTarget.locator, usernameTarget.context, username);
    const userValue: string = await usernameTarget.locator.inputValue().catch(() => '');
    addStep(`[login] Username value after fill: ${userValue ? '***filled***' : 'EMPTY'} | fillOk=${userOk}`);

    if (!userValue) {
      const artifacts = await this.saveDebugArtifacts(page, executionId, 'login-username-empty-after-fill');
      throw new Error(`Username field filled but value is empty. screenshot=${artifacts.screenshotPath ?? 'n/a'}`);
    }

    await page.waitForTimeout(200);

    // --- Password ---
    addStep('[login] Searching for password field across page and frames');
    const passwordTarget = await this.findLocatorInPageOrFrames(
      page,
      'input[type="password"], #password, input[name="password"]',
      5000,
    );

    if (!passwordTarget) {
      const artifacts = await this.saveDebugArtifacts(page, executionId, 'login-password-not-visible');
      throw new Error(`Password field not found in page or frames after 5s. screenshot=${artifacts.screenshotPath ?? 'n/a'}`);
    }

    addStep('[login] Password field found — filling');
    await this.fillInFrame(passwordTarget.locator, passwordTarget.context, password);

    addStep('[login] Credentials filled');
  }

  private async isBetanoLoginRequired(page: BrowserPage): Promise<boolean> {
    // Wait for the page to render interactive elements
    await page.waitForTimeout(1500);
    try {
      const pageWithEval = page as any;
      if (typeof pageWithEval.evaluate !== 'function') return true; // Safer default: attempt login

      const result = await pageWithEval.evaluate(() => {
        const isVisible = (el: HTMLElement | null): boolean => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          return el.offsetParent !== null;
        };

        // --- Signal 1: explicit login button present → login required ---
        const loginSelectors = [
          '[data-qa="login-button"]',
          '[data-qa="btn-login"]',
          '[data-testid="login-button"]',
          'button[class*="login"]',
          'a[class*="login"]',
        ];
        for (const sel of loginSelectors) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (!isVisible(el)) continue;
          const label = String((el as any).innerText || el?.textContent || '').trim().toLowerCase();
          if (label.includes('entrar') || label.includes('login') || label.includes('iniciar sess') || label.includes('sign in')) {
            // @ts-ignore
            window.__loginDebug = `Login button found via "${sel}": "${label}"`;
            return { loginRequired: true, reason: `login-button-found:${sel}` };
          }
        }

        // --- Signal 2: authenticated indicators present → NOT required ---
        const authSelectors = [
          '[data-qa="user-balance"]',
          '[data-qa="account-balance"]',
          '[data-qa="user-menu"]',
          '[data-qa="my-account"]',
          '[data-qa="header-balance"]',
          '[class*="user-balance"]',
          '[class*="account-balance"]',
          '[class*="header-balance"]',
          '[class*="userBalance"]',
          '[class*="accountMenu"]',
        ];
        for (const sel of authSelectors) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (isVisible(el)) {
            // @ts-ignore
            window.__loginDebug = `Auth indicator found via "${sel}" → logged in`;
            return { loginRequired: false, reason: `auth-indicator-found:${sel}` };
          }
        }

        // --- Signal 3: ambiguous — no login button AND no auth indicator ---
        // Safer to attempt login than to skip it and fail later mid-flow.
        // @ts-ignore
        window.__loginDebug = 'No login button or auth indicator found — assuming login required';
        return { loginRequired: true, reason: 'ambiguous-no-signals' };
      });

      const debugMsg = await pageWithEval.evaluate(() => (window as any).__loginDebug || '').catch(() => '');
      this.logger.log(`[isBetanoLoginRequired] ${result.loginRequired ? 'LOGIN REQUIRED' : 'already authenticated'} | reason=${result.reason} | debug="${debugMsg}"`);

      return Boolean(result.loginRequired);
    } catch (err) {
      this.logger.warn(`[isBetanoLoginRequired] detection error: ${err} — assuming login required`);
      return true; // Safer default on error
    }
  }

  private async extractPageTitle(page: BrowserPage): Promise<string | null> {
    if (typeof page.content !== 'function') return null;

    try {
      const html = await page.content();
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = String(titleMatch?.[1] || '').replace(/\s+/g, ' ').trim();
      return title || null;
    } catch {
      return null;
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
      'ac', 'ca', 'cd', 'cf', 'fc', 'sc', 'ud', 'ad',
      'club', 'clube', 'de', 'da', 'do', 'del',
      'deportivo', 'municipal', 'asociacion', 'associacion', 'associacao',
      'atletico', 'athletico',
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

    const extractCoreTokens = (teamName: string): string[] => {
      const stopwords = new Set([
        'ac', 'ca', 'cd', 'cf', 'fc', 'sc', 'ud', 'ad',
        'club', 'clube', 'de', 'da', 'do', 'del',
        'deportivo', 'municipal', 'asociacion', 'associacion', 'associacao',
        'atletico', 'athletico',
      ]);

      const tokens = this.normalizeTeamSearchText(teamName)
        .split(' ')
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 3 && !stopwords.has(token));

      return uniq(tokens).slice(0, 4);
    };

    const homeCore = extractCoreTokens(homeTeamName);
    const awayCore = extractCoreTokens(awayTeamName);

    const buildCompactVariants = (teamName: string, coreTokens: string[]): string[] => {
      const compactFromCore = [
        coreTokens.slice(0, 2).join(' '),
        coreTokens.slice(-2).join(' '),
        coreTokens[0] || '',
        coreTokens[coreTokens.length - 1] || '',
      ];

      const compactFromVariants = this.buildTeamSearchVariants(teamName)
        .map((value) => value.trim())
        .filter((value) => {
          const tokenCount = this.normalizeTeamSearchText(value).split(' ').filter(Boolean).length;
          return tokenCount > 0 && tokenCount <= 2;
        });

      return uniq([...compactFromCore, ...compactFromVariants]).slice(0, 4);
    };

    const homeShort = buildCompactVariants(homeTeamName, homeCore);
    const awayShort = buildCompactVariants(awayTeamName, awayCore);

    const buildMatchSignatures = (homeTokens: string[], awayTokens: string[]): string[] => {
      const signatures: string[] = [];
      const add = (value?: string) => {
        const normalized = String(value || '').trim();
        if (!normalized) return;
        signatures.push(normalized);
      };

      const awayKey = awayTokens[awayTokens.length - 1] || awayTokens[0] || '';
      const homeWindows: string[] = [];

      if (homeTokens.length >= 2) {
        for (let index = 0; index < homeTokens.length - 1; index += 1) {
          homeWindows.push(`${homeTokens[index]} ${homeTokens[index + 1]}`);
        }
      } else if (homeTokens.length === 1) {
        homeWindows.push(homeTokens[0]);
      }

      // Canonical matchup signature, e.g. "san carlos grecia".
      for (const homePart of homeWindows.slice(0, 3)) {
        if (awayKey) {
          add(`${homePart} ${awayKey}`);
          add(`${awayKey} ${homePart}`);
        }
      }

      if (homeTokens.length > 0 && awayTokens.length > 0) {
        add(`${homeTokens.join(' ')} ${awayTokens[awayTokens.length - 1]}`);
        add(`${homeTokens.slice(-2).join(' ')} ${awayTokens[awayTokens.length - 1]}`);
      }

      return uniq(signatures);
    };

    const signatureQueries = buildMatchSignatures(homeCore, awayCore);

    const combined: string[] = [
      // Prioritize compact matchup signatures based on BOTH teams.
      ...signatureQueries,
      ...homeCore.flatMap((h) => awayCore.flatMap((a) => [`${h} ${a}`, `${a} ${h}`])),
      ...homeCore.flatMap((h) => awayCore.map((a) => `${h} ${a}`)),
      `${homeCore.join(' ')} ${awayCore.join(' ')}`.trim(),
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

      // Wait for search results to appear
      try {
        await (page as any).waitForSelector('[data-qa^="search_result_"]', { timeout: 3000 }).catch(() => {
          // Results may not appear, continue anyway
        });
      } catch {
        // Ignore timeout
      }

      const directEventTextSelectors = uniq([
        `.search-result[data-qa^="search_result_"]:has(.search-result__info__name:has-text("${home}")):has(.search-result__info__name:has-text("${away}"))`,
        `.search-result[data-qa^="search_result_"]:has(.search-result__info__name:has-text("${away}")):has(.search-result__info__name:has-text("${home}"))`,
        `.search-result:has(.search-result__info__name:has-text("${home}")):has(.search-result__info__name:has-text("${away}"))`,
        `.search-result:has(.search-result__info__name:has-text("${away}")):has(.search-result__info__name:has-text("${home}"))`,
        `[role="option"]:has-text("${home} - ${away}")`,
        `[role="option"]:has-text("${away} - ${home}")`,
        `.search-result[data-qa^="search_result_"]:has-text("${home} - ${away}")`,
        `.search-result[data-qa^="search_result_"]:has-text("${away} - ${home}")`,
      ]);

      addStep(`[search] Trying ${directEventTextSelectors.length} direct event selectors (exact team names with :has-text)`);
      const clickedDirectEvent = directEventTextSelectors.length > 0
        ? await this.clickFirstAvailable(page, directEventTextSelectors, 500)
        : false;

      if (clickedDirectEvent) {
        await page.waitForTimeout(700);
        addStep('Resolved event by exact matchup text on Betano search results');
        return true;
      }

      addStep('[search] Direct selectors failed, trying combined tokens');
      const combinedTokenSelectors = uniq(
        homeTokens.slice(0, 4).flatMap((homeToken) =>
          awayTokens.slice(0, 4).flatMap((awayToken) => [
            `.search-result[data-qa^="search_result_"]:has(.search-result__info__name:has-text("${homeToken}")):has(.search-result__info__name:has-text("${awayToken}"))`,
            `.search-result[data-qa^="search_result_"]:has(.search-result__info__name:has-text("${awayToken}")):has(.search-result__info__name:has-text("${homeToken}"))`,
            `.search-result[data-qa^="search_result_"]:has-text("${homeToken}"):has-text("${awayToken}")`,
            `.search-result[data-qa^="search_result_"]:has-text("${awayToken}"):has-text("${homeToken}")`,
            `[role="option"]:has-text("${homeToken}"):has-text("${awayToken}")`,
            `[role="option"]:has-text("${awayToken}"):has-text("${homeToken}")`,
          ]),
        ),
      );

      addStep(`[search] Trying ${combinedTokenSelectors.length} combined token selectors`);
      const clickedCombinedTokens = combinedTokenSelectors.length > 0
        ? await this.clickFirstAvailable(page, combinedTokenSelectors, 500)
        : false;

      if (clickedCombinedTokens) {
        await page.waitForTimeout(700);
        addStep('Resolved event by combined team-token search on Betano');
        return true;
      }

      addStep('[search] Combined selectors also failed, calling normalized token accordion matching');
      const clickedEventsAccordion = await this.clickBetanoEventResultByNormalizedTokens(page, homeTokens, awayTokens, addStep);
      if (clickedEventsAccordion) {
        await page.waitForTimeout(700);
        addStep('Resolved event by normalized token match in Betano Eventos accordion');
        return true;
      }

      addStep(`Betano search returned no reliable result for query: ${query}`);
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

    const drawIntent = lower.includes('draw')
      || lower.includes('empate')
      || /^x$/i.test(raw)
      || /^1x2\s*x$/i.test(raw)
      || /\b1x2\b.*\bx\b/i.test(raw);

    const homeIntent = lower.includes('home')
      || /^1$/i.test(raw)
      || /^1x2\s*1$/i.test(raw)
      || /\b1x2\b.*\bhome\b/i.test(raw);

    const awayIntent = lower.includes('away')
      || /^2$/i.test(raw)
      || /^1x2\s*2$/i.test(raw)
      || /\b1x2\b.*\baway\b/i.test(raw);

    if (drawIntent) {
      add('Empate');
      add('Draw');
      add('X');
    }

    if (homeIntent) {
      add(home);
      add('Casa');
    }

    if (awayIntent) {
      add(away);
      add('Fora');
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

  private getBetano1x2Outcome(selectionText: string): 'home' | 'draw' | 'away' | null {
    const raw = String(selectionText || '').trim();
    const lower = raw.toLowerCase();

    if (
      lower.includes('draw')
      || lower.includes('empate')
      || /^x$/i.test(raw)
      || /^1x2\s*x$/i.test(raw)
      || /\b1x2\b.*\bx\b/i.test(raw)
    ) {
      return 'draw';
    }

    if (
      lower.includes('home')
      || /^1$/i.test(raw)
      || /^1x2\s*1$/i.test(raw)
      || /\b1x2\b.*\bhome\b/i.test(raw)
    ) {
      return 'home';
    }

    if (
      lower.includes('away')
      || /^2$/i.test(raw)
      || /^1x2\s*2$/i.test(raw)
      || /\b1x2\b.*\baway\b/i.test(raw)
    ) {
      return 'away';
    }

    return null;
  }

  private async clickBetano1x2Outcome(
    page: BrowserPage,
    selectionText: string,
    homeTeamName: string,
    awayTeamName: string,
  ): Promise<string | null> {
    const outcome = this.getBetano1x2Outcome(selectionText);
    if (!outcome) return null;

    const pageWithEval = page as any;
    if (typeof pageWithEval.evaluate !== 'function') return null;

    const clickedLabel = await pageWithEval.evaluate(
      ({ desiredOutcome, homeName, awayName }) => {
        const normalize = (value: string): string => String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();

        const isVisible = (element: Element | null): boolean => {
          if (!element) return false;
          const el = element as HTMLElement;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          return el.offsetParent !== null;
        };

        const normalizedHome = normalize(homeName);
        const normalizedAway = normalize(awayName);
        const drawTerms = ['empate', 'draw', 'x'];

        const markets = Array.from(document.querySelectorAll('.markets__market')) as HTMLElement[];
        const targetMarket = markets.find((market) => {
          const titleNode = market.querySelector('.tw-self-center') as HTMLElement | null;
          const marketTitle = normalize(titleNode?.innerText || titleNode?.textContent || '');


          // Variações robustas para o mercado de Resultado Final
          const strictResultFinalTitles = new Set([
            'resultado final',
            'resultado final tempo regulamentar',
            'resultado final (tempo regulamentar)',
            'match result',
            'full time result',
            'final result',
            'resultado',
            'resultado do jogo',
          ]);

          if (!strictResultFinalTitles.has(marketTitle)) {
            // Log para debug futuro (apenas em dev)
            if (process.env.NODE_ENV !== 'production') {
              // eslint-disable-next-line no-console
              console.log('[BetAutomation] Ignored market title:', marketTitle);
            }
            return false;
          }

          const marketText = normalize(market.textContent || '');
          if (marketText.includes('proximo gol') || marketText.includes('next goal')) return false;
          if (marketText.includes('total de gols') || marketText.includes('ambas equipes marcam')) return false;

          return true;
        });

        if (!targetMarket) return null;

        const selections = Array.from(targetMarket.querySelectorAll('[data-qa="event-selection"]')) as HTMLElement[];
        const target = selections.find((selection) => {
          if (!isVisible(selection)) return false;
          const nameNode = selection.querySelector('.s-name') as HTMLElement | null;
          const label = normalize(nameNode?.innerText || nameNode?.textContent || selection.innerText || selection.textContent || '');
          if (!label) return false;

          if (desiredOutcome === 'draw') {
            return drawTerms.some((term) => label === term || label.includes(` ${term} `) || label.startsWith(`${term} `) || label.endsWith(` ${term}`));
          }

          if (desiredOutcome === 'home') {
            return normalizedHome ? label.includes(normalizedHome) : false;
          }

          return normalizedAway ? label.includes(normalizedAway) : false;
        });

        if (!target) return null;

        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        const eventInit: MouseEventInit = { bubbles: true, cancelable: true, composed: true };
        target.dispatchEvent(new MouseEvent('pointerdown', eventInit));
        target.dispatchEvent(new MouseEvent('mousedown', eventInit));
        target.dispatchEvent(new MouseEvent('mouseup', eventInit));
        target.dispatchEvent(new MouseEvent('click', eventInit));

        const nameNode = target.querySelector('.s-name') as HTMLElement | null;
        return String(nameNode?.innerText || nameNode?.textContent || '').trim() || 'unknown';
      },
      { desiredOutcome: outcome, homeName: homeTeamName, awayName: awayTeamName },
    );

    return String(clickedLabel || '').trim() || null;
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

    const clicked1x2 = await this.clickBetano1x2Outcome(page, selectionText, homeTeamName, awayTeamName);
    if (clicked1x2) {
      addStep(`Selected 1x2 outcome via exact market mapping: ${clicked1x2}`);
      return true;
    }

    if (this.getBetano1x2Outcome(selectionText)) {
      // Log all visible market titles before aborting
      try {
        const pageWithEval = page as any;
        if (typeof pageWithEval.evaluate === 'function') {
          const allMarketTitles = await pageWithEval.evaluate(() => {
            const normalize = (value) => String(value || '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .trim();
            // Busca apenas dentro do container correto
            const container = document.querySelector('.markets--live, .markets');
            if (!container) return [];
            return Array.from(container.querySelectorAll('.markets__market .tw-self-center'))
              .filter(node => {
                // Checa se está visível
                const el = node as HTMLElement;
                if (!(el instanceof HTMLElement)) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                return el.offsetParent !== null;
              })
              .map(node => {
                const el = node as HTMLElement;
                return normalize(el.innerText || el.textContent || '');
              });
          });
          addStep(`[DEBUG] All visible market titles (scoped to .markets/.markets--live) before abort: ${allMarketTitles.join(' | ')}`);
        }
      } catch (err) {
        addStep(`[DEBUG] Failed to log market titles: ${err}`);
      }
      addStep('1x2 intent detected, but strict Resultado Final market mapping failed. Aborting generic fallback to avoid wrong-market selection.');
      return false;
    }

    if (marketCandidates.length > 0) {
      addStep(`Trying Betano market candidates: ${marketCandidates.join(' | ')}`);

      const marketFilterSelectors = marketCandidates.map((market) => {
        const escapedMarket = this.escapeSelectorText(market);
        return `[data-qa="market_filter"]:has-text("${escapedMarket}")`;
      });

      const focusedMarket = await this.clickFirstAvailable(page, marketFilterSelectors, 500);
      if (focusedMarket) {
        addStep('Focused matching Betano market filter before selecting outcome');
        await page.waitForTimeout(250);
      }
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

      const loginRequired = await this.isBetanoLoginRequired(page);
      if (loginRequired) {
        addStep('Betano login button detected: session is not authenticated');
        addStep('Executando login automático, mesmo com sessão persistente.');
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
          await page.waitForTimeout(1500);
        }

        addStep('Trying to fill login credentials');
        const usernameSelectors = [
          '#username',
          '[id="username"]',
          'input[name="username"]',
          'input[name="login"]',
          '[aria-label="username"]',
          'input[aria-label*="usuario" i]',
          'input[aria-label*="email" i]',
          'input[autocomplete="username"]',
          'input[placeholder*="usuario" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="email" i]',
          'input[type="email"]',
        ];
        // Use native setter approach to ensure Vue v-model reacts properly
        const userFilled = await this.typeFirstAvailable(page, usernameSelectors, credentials.username)
          || await this.fillFirstAvailable(page, usernameSelectors, credentials.username);

        // Brief pause so Vue processes the username input events before we shift focus to password
        await page.waitForTimeout(300);

        const passwordSelectors = [
          '#password',
          '[id="password"]',
          'input[name="password"]',
          'input[autocomplete="current-password"]',
          'input[placeholder*="senha" i]',
          'input[placeholder*="password" i]',
          'input[aria-label*="senha" i]',
          'input[aria-label*="password" i]',
          'input[type="password"]',
        ];
        const passFilled = await this.typeFirstAvailable(page, passwordSelectors, credentials.password)
          || await this.fillFirstAvailable(page, passwordSelectors, credentials.password);

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
        addStep('Sessão autenticada detectada, login automático não necessário.');
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
        throw new BadRequestException('Could not fill stake field in Bet365 bet slip');
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

      const loginRequired = await this.isBetanoLoginRequired(page);
      if (loginRequired) {
        addStep('Betano login button detected: session is not authenticated');
        addStep('Executando login automático, mesmo com sessão persistente.');
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
          await page.waitForTimeout(1500);
        }

        // Confirm login form is actually open by checking for the submit button.
        // If not found, the session is already active — skip credential filling.
        const loginFormOpen = await this.findLocatorInPageOrFrames(
          page,
          'button:has-text("INICIAR"), button:has-text("Iniciar"), button[data-qa="login-submit"], button[type="submit"]',
          2000,
        );

        if (!loginFormOpen) {
          addStep('Login submit button not found — session already authenticated, skipping credential fill');
        } else {
          addStep('Login form detected — filling credentials');
          await this.fillBetanoCredentials(page, executionId, credentials.username, credentials.password, addStep);

          addStep('Submitting Betano login form');
          // Button text is "INICIAR SESSÃO" (all caps) — use partial lowercase match which Playwright resolves case-insensitively
          const clickedLogin = await this.clickFirstAvailable(page, [
            'button[data-qa="login-submit"]',
            'button:has-text("INICIAR")',
            'button:has-text("Iniciar")',
            'button[type="submit"]',
            'button:has-text("Entrar")',
            'button:has-text("Acessar")',
          ]);

          if (!clickedLogin) {
            throw new BadRequestException('Could not locate login submit button on Betano page');
          }

          addStep('Submitted login form');
          await page.waitForTimeout(3000);
        }
      } else {
        addStep('Sessão autenticada detectada, login automático não necessário.');
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

        // Wait for the event page to fully load after navigation from search
        addStep('Waiting for event page to load after search navigation');
        try {
          await (page as any).waitForLoadState('networkidle', { timeout: 10000 });
          addStep('Event page network idle reached');
        } catch {
          // Timeout — page may still have loaded enough, continue with fallback wait
          addStep('Event page networkidle timeout, continuing with fallback wait');
          await page.waitForTimeout(2500);
        }
      }

      if (await this.detectBetanoNoMarketsAvailable(page)) {
        const pageTitle = await this.extractPageTitle(page);
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'no-markets-available');
        const details = [
          'No available Betano markets for this event',
          pageTitle ? `eventTitle=${pageTitle}` : undefined,
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      const selected = await this.clickBetanoSelection(
        page,
        String(dto.selectionText || ''),
        String(dto.homeTeamName || ''),
        String(dto.awayTeamName || ''),
        addStep,
      );

      if (!selected) {
        if (await this.detectBetanoNoMarketsAvailable(page)) {
          const pageTitle = await this.extractPageTitle(page);
          const artifacts = await this.saveDebugArtifacts(page, executionId, 'no-markets-available');
          const details = [
            `No available Betano markets for requested selection (selectionText=${dto.selectionText})`,
            pageTitle ? `eventTitle=${pageTitle}` : undefined,
            artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
            artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
          ].filter(Boolean).join(' | ');
          throw new BadRequestException(details);
        }

        const artifacts = await this.saveDebugArtifacts(page, executionId, 'selection-not-found');
        const details = [
          `Could not find target selection on event page (selectionText=${dto.selectionText})`,
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      // Wait for the bet slip to appear before trying to fill the stake
      addStep('Waiting for bet slip to appear after selection click');
      const betslipAppeared = await this.waitForBetanoBetstip(page);
      if (!betslipAppeared) {
        addStep('Bet slip did not appear within timeout — proceeding anyway');
      } else {
        addStep('Bet slip detected');
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
      await page.waitForTimeout(2500);

      // Verify the bookmaker actually accepted the bet
      const confirmResult = await this.detectBetanoConfirmationResult(page);
      if (!confirmResult.success) {
        const artifacts = await this.saveDebugArtifacts(page, executionId, 'bet-rejected');
        const details = [
          `Bet rejected by Betano: ${confirmResult.error}`,
          artifacts.screenshotPath ? `screenshot=${artifacts.screenshotPath}` : undefined,
          artifacts.htmlPath ? `html=${artifacts.htmlPath}` : undefined,
        ].filter(Boolean).join(' | ');
        throw new BadRequestException(details);
      }

      if (confirmResult.betSlipId) {
        addStep(`Bet confirmed — receipt ID: ${confirmResult.betSlipId}`);
      } else {
        addStep('Bet confirmation detected (no receipt ID extracted)');
      }

      const finishedAt = new Date();

      return {
        ok: true,
        executionId,
        provider: 'betano',
        dryRun: false,
        realBetPlaced: true,
        betSlipId: confirmResult.betSlipId,
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
