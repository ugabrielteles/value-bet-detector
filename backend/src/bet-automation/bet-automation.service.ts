import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BookmakerCredentialsService } from '../bookmaker-credentials/bookmaker-credentials.service';
import { RunBetanoBetDto } from './application/dtos/run-betano-bet.dto';
import { RunBookmakerAutomationDto } from './application/dtos/run-bookmaker-automation.dto';
import { BookmakerProvider } from '../bookmaker-credentials/domain/entities/bookmaker-credentials.entity';

type BrowserPage = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
  fill: (selector: string, value: string) => Promise<void>;
  click: (selector: string, options?: Record<string, unknown>) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
  locator: (selector: string) => { first: () => { click: () => Promise<void> } };
};

@Injectable()
export class BetAutomationService {
  private readonly logger = new Logger(BetAutomationService.name);

  constructor(private readonly bookmakerCredentialsService: BookmakerCredentialsService) {}

  private async fillFirstAvailable(page: BrowserPage, selectors: string[], value: string): Promise<boolean> {
    for (const selector of selectors) {
      try {
        await page.fill(selector, value);
        return true;
      } catch {
        // Try next selector.
      }
    }
    return false;
  }

  private async clickFirstAvailable(page: BrowserPage, selectors: string[]): Promise<boolean> {
    for (const selector of selectors) {
      try {
        await page.click(selector, { timeout: 3000 });
        return true;
      } catch {
        // Try next selector.
      }
    }
    return false;
  }

  async listProviders(userId: string): Promise<Array<{
    provider: BookmakerProvider;
    label: string;
    automationAvailable: boolean;
    isConfigured: boolean;
    hasCredentials: boolean;
  }>> {
    const providers = this.bookmakerCredentialsService.getSupportedProviders();
    const configured = await this.bookmakerCredentialsService.listForUser(userId);
    const configuredSet = new Set(
      configured.filter((c) => c.hasUsername && c.hasPassword).map((c) => c.provider),
    );

    return providers.map((provider) => ({
      provider,
      label: provider.toUpperCase(),
      automationAvailable: provider === 'betano',
      isConfigured: configuredSet.has(provider),
      hasCredentials: configuredSet.has(provider),
    }));
  }

  async run(userId: string, dto: RunBookmakerAutomationDto): Promise<Record<string, unknown>> {
    if (dto.provider === 'betano') {
      return this.runBetano(userId, dto);
    }

    throw new BadRequestException(`Automation for provider "${dto.provider}" is not implemented yet`);
  }

  async runBetano(userId: string, dto: Pick<RunBetanoBetDto, 'eventUrl' | 'selectionText' | 'stake' | 'dryRun' | 'confirmRealBet'>): Promise<Record<string, unknown>> {
    const credentials = await this.bookmakerCredentialsService.getDecryptedForAutomation(userId, 'betano');

    const allowRealBetting = process.env.ALLOW_REAL_BETTING === 'true';
    const isDryRun = dto.dryRun !== false;
    const canPlaceRealBet = !isDryRun && dto.confirmRealBet === true && allowRealBetting;

    const steps: string[] = [];

    let playwright: { chromium: { launch: (options: Record<string, unknown>) => Promise<any> } };
    try {
      playwright = await import('playwright');
    } catch {
      throw new BadRequestException('Playwright not installed. Run: npm install playwright');
    }

    const browser = await playwright.chromium.launch({
      headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    });

    try {
      const context = await browser.newContext();
      const page: BrowserPage = await context.newPage();

      const loginUrl = credentials.loginUrl || 'https://www.betano.bet.br';
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      steps.push('Opened Betano login page');

      await this.clickFirstAvailable(page, [
        'button:has-text("Aceitar")',
        'button:has-text("Accept")',
        '#onetrust-accept-btn-handler',
      ]);

      const userFilled = await this.fillFirstAvailable(page, [
        'input[name="username"]',
        'input[name="login"]',
        'input[type="email"]',
        'input[type="text"]',
      ], credentials.username);

      const passFilled = await this.fillFirstAvailable(page, [
        'input[name="password"]',
        'input[type="password"]',
      ], credentials.password);

      if (!userFilled || !passFilled) {
        throw new BadRequestException('Could not locate login fields on Betano page');
      }

      const clickedLogin = await this.clickFirstAvailable(page, [
        'button[type="submit"]',
        'button:has-text("Entrar")',
        'button:has-text("Login")',
      ]);

      if (!clickedLogin) {
        throw new BadRequestException('Could not locate login button on Betano page');
      }

      steps.push('Submitted login form');
      await page.waitForTimeout(2500);

      await page.goto(dto.eventUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      steps.push('Opened event page');

      // Try to click the desired market selection by visible text.
      try {
        await page.locator(`text=${dto.selectionText}`).first().click();
        steps.push('Selected market option');
      } catch {
        throw new BadRequestException('Could not find target selection on event page');
      }

      const stakeFilled = await this.fillFirstAvailable(page, [
        'input[name="stake"]',
        'input[inputmode="decimal"]',
        'input[type="number"]',
      ], String(dto.stake));

      if (!stakeFilled) {
        throw new BadRequestException('Could not fill stake field in bet slip');
      }

      steps.push('Filled stake amount');

      if (!canPlaceRealBet) {
        steps.push('Dry-run mode active: skipped final confirmation click');
        return {
          ok: true,
          provider: 'betano',
          dryRun: true,
          canPlaceRealBet: false,
          reason: allowRealBetting
            ? 'Set dryRun=false and confirmRealBet=true to place a real bet'
            : 'ALLOW_REAL_BETTING is disabled on server',
          steps,
        };
      }

      const clickedConfirm = await this.clickFirstAvailable(page, [
        'button:has-text("Apostar")',
        'button:has-text("Confirmar")',
        'button:has-text("Place Bet")',
      ]);

      if (!clickedConfirm) {
        throw new BadRequestException('Could not find final confirmation button in bet slip');
      }

      steps.push('Clicked final bet confirmation button');
      await page.waitForTimeout(1500);

      return {
        ok: true,
        provider: 'betano',
        dryRun: false,
        realBetPlaced: true,
        steps,
      };
    } catch (error: unknown) {
      this.logger.warn(`[betano-automation] ${(error as Error).message}`);
      throw error;
    } finally {
      await browser.close();
    }
  }
}
