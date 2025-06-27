export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  metadata: TenantMetadata;
  limits: TenantLimits;
  createdAt: Date;
  updatedAt: Date;
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
  TRIAL = 'trial',
}

export enum TenantPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export interface TenantMetadata {
  contactEmail: string;
  contactName: string;
  company?: string;
  industry?: string;
  country?: string;
  customFields?: Record<string, any>;
}

export interface TenantLimits {
  maxAgents: number;
  maxExecutions: number;
  maxExecutionsPerMinute: number;
  maxStorageGB: number;
  maxRetentionDays: number;
  features: TenantFeatures;
}

export interface TenantFeatures {
  customPatterns: boolean;
  advancedAnalytics: boolean;
  apiAccess: boolean;
  ssoEnabled: boolean;
  mfaRequired: boolean;
  auditLogs: boolean;
  dataExport: boolean;
  prioritySupport: boolean;
}

export interface TenantUsage {
  tenantId: string;
  period: UsagePeriod;
  agents: {
    current: number;
    peak: number;
  };
  executions: {
    total: number;
    successful: number;
    failed: number;
  };
  storage: {
    usedGB: number;
    percentUsed: number;
  };
  apiCalls: {
    total: number;
    byEndpoint: Record<string, number>;
  };
}

export interface UsagePeriod {
  start: Date;
  end: Date;
  type: 'daily' | 'weekly' | 'monthly';
}

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  plan: TenantPlan;
  limits: TenantLimits;
  userId?: string;
  userRoles?: string[];
}

export interface TenantResource {
  id: string;
  tenantId: string;
  resourceType: ResourceType;
  resourceId: string;
  createdAt: Date;
  createdBy: string;
}

export enum ResourceType {
  AGENT = 'agent',
  PATTERN = 'pattern',
  EXECUTION = 'execution',
  USER = 'user',
  API_KEY = 'api_key',
}

export interface TenantQuota {
  tenantId: string;
  resource: string;
  limit: number;
  used: number;
  period?: 'minute' | 'hour' | 'day' | 'month';
  resetAt?: Date;
}

export interface RateLimitConfig {
  resource: string;
  limit: number;
  window: number; // in seconds
  keyPrefix?: string;
}

// Default limits by plan
export const DEFAULT_LIMITS: Record<TenantPlan, TenantLimits> = {
  [TenantPlan.FREE]: {
    maxAgents: 3,
    maxExecutions: 1000,
    maxExecutionsPerMinute: 10,
    maxStorageGB: 1,
    maxRetentionDays: 7,
    features: {
      customPatterns: false,
      advancedAnalytics: false,
      apiAccess: true,
      ssoEnabled: false,
      mfaRequired: false,
      auditLogs: false,
      dataExport: false,
      prioritySupport: false,
    },
  },
  [TenantPlan.STARTER]: {
    maxAgents: 10,
    maxExecutions: 10000,
    maxExecutionsPerMinute: 50,
    maxStorageGB: 10,
    maxRetentionDays: 30,
    features: {
      customPatterns: true,
      advancedAnalytics: false,
      apiAccess: true,
      ssoEnabled: false,
      mfaRequired: true,
      auditLogs: true,
      dataExport: true,
      prioritySupport: false,
    },
  },
  [TenantPlan.PROFESSIONAL]: {
    maxAgents: 50,
    maxExecutions: 100000,
    maxExecutionsPerMinute: 200,
    maxStorageGB: 100,
    maxRetentionDays: 90,
    features: {
      customPatterns: true,
      advancedAnalytics: true,
      apiAccess: true,
      ssoEnabled: true,
      mfaRequired: true,
      auditLogs: true,
      dataExport: true,
      prioritySupport: true,
    },
  },
  [TenantPlan.ENTERPRISE]: {
    maxAgents: -1, // unlimited
    maxExecutions: -1,
    maxExecutionsPerMinute: -1,
    maxStorageGB: -1,
    maxRetentionDays: 365,
    features: {
      customPatterns: true,
      advancedAnalytics: true,
      apiAccess: true,
      ssoEnabled: true,
      mfaRequired: true,
      auditLogs: true,
      dataExport: true,
      prioritySupport: true,
    },
  },
};