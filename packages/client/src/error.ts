export class ParallaxError extends Error {
  readonly status: number;
  readonly code: string;
  readonly upgradeUrl?: string;
  readonly body?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    body?: unknown,
    upgradeUrl?: string
  ) {
    super(message);
    this.name = 'ParallaxError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.upgradeUrl = upgradeUrl;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isEnterprise(): boolean {
    return this.status === 403 && !!this.upgradeUrl;
  }

  get isValidation(): boolean {
    return this.status === 400;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export class ParallaxTimeoutError extends ParallaxError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, 408, 'TIMEOUT');
    this.name = 'ParallaxTimeoutError';
  }
}

export class ParallaxNetworkError extends ParallaxError {
  constructor(message: string) {
    super(message, 0, 'NETWORK_ERROR');
    this.name = 'ParallaxNetworkError';
  }
}
