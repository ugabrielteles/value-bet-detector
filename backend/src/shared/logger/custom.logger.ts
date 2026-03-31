import { ConsoleLogger, Injectable } from '@nestjs/common';

@Injectable()
export class CustomLogger extends ConsoleLogger {
  private debugServices: string[] = [];

  constructor() {
    super();
    // Parse DEBUG_SERVICES from env (comma-separated)
    const debugServicesEnv = process.env.DEBUG_SERVICES || '';
    this.debugServices = debugServicesEnv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // If no specific services set, log all
    if (this.debugServices.length === 0) {
      this.debugServices = ['*'];
    }
  }

  log(message: string, context?: string) {
    if (this.shouldLog(context)) {
      super.log(message, context);
    }
  }

  error(message: string, trace?: string, context?: string) {
    if (this.shouldLog(context)) {
      super.error(message, trace, context);
    }
  }

  warn(message: string, context?: string) {
    if (this.shouldLog(context)) {
      super.warn(message, context);
    }
  }

  debug(message: string, context?: string) {
    if (this.shouldLog(context)) {
      super.debug(message, context);
    }
  }

  verbose(message: string, context?: string) {
    if (this.shouldLog(context)) {
      super.verbose(message, context);
    }
  }

  private shouldLog(context?: string): boolean {
    // Always log if no context provided
    if (!context) {
      return this.debugServices.includes('*');
    }

    // Log all if wildcard is set
    if (this.debugServices.includes('*')) {
      return true;
    }

    // Check if context matches any debug service
    return this.debugServices.some(
      (service) =>
        context.includes(service) ||
        service === '*'
    );
  }
}
