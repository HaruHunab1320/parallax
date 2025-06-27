import { AsyncLocalStorage } from 'async_hooks';
import { TenantContext } from './types';

/**
 * Async local storage for tenant context
 */
const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Get current tenant context
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Run function with tenant context
 */
export function runWithTenantContext<T>(
  context: TenantContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return tenantContextStorage.run(context, fn);
}

/**
 * Get current tenant ID from context
 */
export function getCurrentTenantId(): string {
  const context = getTenantContext();
  if (!context) {
    throw new Error('No tenant context available');
  }
  return context.tenantId;
}

/**
 * Check if current context has feature
 */
export function hasFeature(feature: keyof TenantContext['limits']['features']): boolean {
  const context = getTenantContext();
  if (!context) {
    return false;
  }
  return context.limits.features[feature] || false;
}

/**
 * Check if current context is within limit
 */
export function checkLimit(
  resource: keyof Omit<TenantContext['limits'], 'features'>,
  current: number
): boolean {
  const context = getTenantContext();
  if (!context) {
    return false;
  }
  const limit = context.limits[resource] as number;
  return limit === -1 || current < limit;
}

/**
 * Decorator to require tenant context
 */
export function RequireTenantContext(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const context = getTenantContext();
    if (!context) {
      throw new Error(`Tenant context required for ${propertyKey}`);
    }
    return originalMethod.apply(this, args);
  };

  return descriptor;
}

/**
 * Decorator to check feature availability
 */
export function RequireFeature(feature: keyof TenantContext['limits']['features']) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      if (!hasFeature(feature)) {
        throw new Error(`Feature '${feature}' is not available for current tenant`);
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}