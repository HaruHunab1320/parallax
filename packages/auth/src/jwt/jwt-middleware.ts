import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { JWTService } from './jwt-service';
import { AuthRequest } from '../types';

export interface JWTMiddlewareOptions {
  credentialsRequired?: boolean;
  extractToken?: (req: Request) => string | null;
}

export class JWTMiddleware {
  constructor(
    private jwtService: JWTService,
    private logger: Logger
  ) {}

  /**
   * Create Express middleware for JWT authentication
   */
  authenticate(options: JWTMiddlewareOptions = {}) {
    const { 
      credentialsRequired = true,
      extractToken = this.defaultTokenExtractor
    } = options;

    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const token = extractToken(req);

        if (!token) {
          if (credentialsRequired) {
            return res.status(401).json({
              error: 'Authentication required',
              message: 'No authorization token provided',
            });
          }
          return next();
        }

        try {
          const payload = await this.jwtService.verifyToken(token);
          req.user = payload;
          req.token = token;
          next();
        } catch (error) {
          this.logger.warn({ error }, 'Invalid token');
          return res.status(401).json({
            error: 'Invalid token',
            message: error instanceof Error ? error.message : 'Token verification failed',
          });
        }
      } catch (error) {
        this.logger.error({ error }, 'Authentication middleware error');
        return res.status(500).json({
          error: 'Internal server error',
          message: 'Authentication processing failed',
        });
      }
    };
  }

  /**
   * Middleware to require specific roles
   */
  requireRoles(...roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated',
        });
      }

      const hasRole = roles.some(role => req.user!.roles.includes(role));
      
      if (!hasRole) {
        this.logger.warn({
          userId: req.user.sub,
          requiredRoles: roles,
          userRoles: req.user.roles,
        }, 'Access denied - insufficient roles');

        return res.status(403).json({
          error: 'Access denied',
          message: 'Insufficient permissions',
          requiredRoles: roles,
        });
      }

      return next();
    };
  }

  /**
   * Middleware to require tenant access
   */
  requireTenant(tenantIdExtractor?: (req: AuthRequest) => string) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated',
        });
      }

      const requestedTenantId = tenantIdExtractor 
        ? tenantIdExtractor(req)
        : req.params.tenantId || req.query.tenantId as string;

      if (!requestedTenantId) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Tenant ID required',
        });
      }

      // Check if user has access to the tenant
      if (req.user.tenantId !== requestedTenantId && !req.user.roles.includes('admin')) {
        this.logger.warn({
          userId: req.user.sub,
          userTenantId: req.user.tenantId,
          requestedTenantId,
        }, 'Access denied - tenant mismatch');

        return res.status(403).json({
          error: 'Access denied',
          message: 'Access to this tenant is not allowed',
        });
      }

      return next();
    };
  }

  /**
   * Default token extractor from Authorization header
   */
  private defaultTokenExtractor(req: Request): string | null {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }
}