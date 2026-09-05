import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const RUNTIME_API_KEY_HEADER = 'x-parallax-runtime-key';

export interface RuntimeSecurityOptions {
  apiKey?: string;
  authMode?: 'required' | 'development';
}

export interface RuntimeCapabilities {
  agents: boolean;
  threads: boolean;
  threadEvents: boolean;
  executionCleanup: boolean;
}

export function isLoopbackHost(host: string): boolean {
  return ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host);
}

/** Service identity shared by the control plane and its trusted runtime. */
export function runtimeSecurity(
  host: string,
  options: RuntimeSecurityOptions = {}
): { authorize(headers: IncomingHttpHeaders): boolean } {
  const mode =
    options.authMode ?? process.env.PARALLAX_RUNTIME_AUTH_MODE ?? 'required';
  if (mode !== 'required' && mode !== 'development') {
    throw new Error('Invalid PARALLAX_RUNTIME_AUTH_MODE');
  }
  if (mode === 'development') {
    if (process.env.NODE_ENV === 'production' || !isLoopbackHost(host)) {
      throw new Error(
        'Runtime development authentication requires a nonproduction loopback listener'
      );
    }
    return { authorize: () => true };
  }
  const key = options.apiKey ?? process.env.PARALLAX_RUNTIME_API_KEY;
  if (!key || Buffer.byteLength(key) < 32 || key.trim() !== key) {
    throw new Error(
      'PARALLAX_RUNTIME_API_KEY must contain at least 32 bytes without surrounding whitespace'
    );
  }
  const expected = createHash('sha256').update(key).digest();
  return {
    authorize(headers) {
      const supplied = headers[RUNTIME_API_KEY_HEADER];
      return (
        typeof supplied === 'string' &&
        supplied.length <= 4096 &&
        timingSafeEqual(
          expected,
          createHash('sha256').update(supplied).digest()
        )
      );
    },
  };
}

/** Avoid path injection and short execution-prefix collisions in shared resources. */
export function executionResourceName(executionId: string): string {
  if (!executionId || executionId.length > 256)
    throw new Error('Invalid execution ID');
  return `parallax-auth-${createHash('sha256').update(executionId).digest('hex').slice(0, 40)}`;
}
