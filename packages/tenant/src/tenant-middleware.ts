import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { TenantService } from './tenant-service';
import { runWithTenantContext } from './tenant-context';
import { TenantContext, TenantStatus } from './types';

export interface TenantRequest extends Request {
  tenant?: TenantContext;
}

export interface TenantMiddlewareOptions {
  headerName?: string;
  paramName?: string;
  queryName?: string;
  defaultTenant?: string;
  requireTenant?: boolean;
}

export class TenantMiddleware {
  constructor(
    private tenantService: TenantService,
    private logger: Logger
  ) {}

  /**
   * Create Express middleware for tenant resolution
   */
  resolve(options: TenantMiddlewareOptions = {}) {
    const {
      headerName = 'x-tenant-id',
      paramName = 'tenantId',
      queryName = 'tenant',
      requireTenant = true,
    } = options;

    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      try {
        // Extract tenant ID from various sources
        const tenantId = this.extractTenantId(req, {
          headerName,
          paramName,
          queryName,
          defaultTenant: options.defaultTenant,
        });

        if (!tenantId) {
          if (requireTenant) {
            return res.status(400).json({
              error: 'Bad Request',
              message: 'Tenant ID is required',
            });
          }
          return next();
        }

        // Get tenant
        const tenant = await this.tenantService.getTenant(tenantId);
        if (!tenant) {
          return res.status(404).json({
            error: 'Not Found',
            message: `Tenant not found: ${tenantId}`,
          });
        }

        // Check tenant status
        if (tenant.status === TenantStatus.SUSPENDED) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Tenant is suspended',
          });
        }

        if (tenant.status === TenantStatus.DELETED) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Tenant not found',
          });
        }

        // Create tenant context
        const context: TenantContext = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          plan: tenant.plan,
          limits: tenant.limits,
          userId: (req as any).user?.sub,
          userRoles: (req as any).user?.roles,
        };

        // Attach to request
        req.tenant = context;

        // Run next middleware with tenant context
        runWithTenantContext(context, () => next());
      } catch (error) {
        this.logger.error({ error }, 'Tenant middleware error');
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to resolve tenant',
        });
      }
    };
  }

  /**
   * Middleware to check tenant limits
   */
  checkLimit(resource: keyof TenantContext['limits'], getCurrentValue: (req: TenantRequest) => Promise<number>) {
    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      if (!req.tenant) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      try {
        const current = await getCurrentValue(req);
        const limit = req.tenant.limits[resource as keyof typeof req.tenant.limits] as number;

        if (limit !== -1 && current >= limit) {
          this.logger.warn({
            tenantId: req.tenant.tenantId,
            resource,
            current,
            limit,
          }, 'Tenant limit exceeded');

          return res.status(429).json({
            error: 'Too Many Requests',
            message: `${resource} limit exceeded`,
            limit,
            current,
          });
        }

        next();
      } catch (error) {
        this.logger.error({ error }, 'Failed to check tenant limit');
        next(error);
      }
    };
  }

  /**
   * Middleware to check feature availability
   */
  requireFeature(feature: keyof TenantContext['limits']['features']) {
    return (req: TenantRequest, res: Response, next: NextFunction) => {
      if (!req.tenant) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Tenant context required',
        });
      }

      if (!req.tenant.limits.features[feature]) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Feature not available: ${feature}`,
          requiredPlan: this.getRequiredPlanForFeature(feature),
        });
      }

      next();
    };
  }

  /**
   * Extract tenant ID from request
   */
  private extractTenantId(
    req: Request,
    options: {
      headerName: string;
      paramName: string;
      queryName: string;
      defaultTenant?: string;
    }
  ): string | null {
    // Priority: header > param > query > default
    return (
      req.headers[options.headerName] as string ||
      req.params[options.paramName] ||
      req.query[options.queryName] as string ||
      options.defaultTenant ||
      null
    );
  }

  /**
   * Get required plan for feature
   */
  private getRequiredPlanForFeature(feature: string): string {
    // This is a simplified version - in reality, you'd check against plan features
    const featurePlans: Record<string, string> = {
      customPatterns: 'starter',
      advancedAnalytics: 'professional',
      ssoEnabled: 'professional',
      prioritySupport: 'professional',
    };

    return featurePlans[feature] || 'enterprise';
  }
}