import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { authenticateAuthorization } from './auth-middleware';
import type { AuthService } from './auth-service';
import { AuthError } from './auth-service';
import { checkApiKeyPermission, hasPermission, type Role } from './rbac';

/** Authorize before accepting the upgrade; URL tokens are intentionally unsupported. */
export async function authorizeExecutionUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  authService: AuthService
): Promise<boolean> {
  try {
    const { user, apiKey } = await authenticateAuthorization(
      authService,
      req.headers.authorization
    );
    if (
      !hasPermission(user.role as Role, 'executions', 'read') ||
      (apiKey &&
        !checkApiKeyPermission(apiKey.permissions, 'executions', 'read'))
    ) {
      throw new AuthError('Execution read permission required', 'FORBIDDEN');
    }
    return true;
  } catch (error) {
    const status = error instanceof AuthError ? error.statusCode : 500;
    const phrase =
      status === 403
        ? 'Forbidden'
        : status === 401
          ? 'Unauthorized'
          : 'Internal Server Error';
    socket.end(
      `HTTP/1.1 ${status} ${phrase}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
    );
    return false;
  }
}
