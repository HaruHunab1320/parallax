import { Logger } from 'pino';

export type LicenseType = 'opensource' | 'enterprise' | 'enterprise-plus';

export interface LicenseInfo {
  type: LicenseType;
  validUntil?: Date;
  clusterId?: string;
  features: string[];
}

/**
 * Enterprise features that require a license
 * Open source gets everything EXCEPT these
 */
const ENTERPRISE_ONLY_FEATURES = [
  // Infrastructure & Operations
  'persistence',              // PostgreSQL/TimescaleDB storage
  'execution_history',        // View past executions
  'metrics_storage',          // Historical metrics
  'web_dashboard',            // Monitoring UI
  'scheduled_patterns',       // Cron & triggers
  'high_availability',        // Clustering, failover
  'distributed_execution',    // Multi-node execution
  'backup_restore',           // Data backup
  'pattern_management',       // Database-backed pattern CRUD

  // Team & Security
  'multi_user',               // Multiple accounts
  'rbac',                     // Role-based access
  'sso_integration',          // SAML/OIDC
  'api_keys',                 // Automation tokens
  'audit_logging',            // Compliance logs
  'mtls_security',            // Mutual TLS

  // Advanced (Enterprise Plus)
  'multi_region',             // Geographic distribution
  'advanced_analytics',       // ML-powered insights
  'pattern_marketplace',      // Share/publish patterns
  'priority_support_24_7',    // Round-the-clock support
];

/**
 * Features available in Open Source (everything else)
 */
const OPENSOURCE_FEATURES = [
  'unlimited_agents',         // No agent limits!
  'all_patterns',             // Voting, consensus, merge, etc.
  'pattern_builder',          // Visual + YAML
  'prism_dsl',                // Full Prism language
  'cli_full',                 // All CLI commands
  'local_execution',          // Single-machine execution
  'in_memory_execution',      // Stateless operation
];

export class UpgradeRequiredError extends Error {
  constructor(
    message: string,
    public readonly feature: string,
    public readonly upgradeUrl: string = 'https://parallax.ai/enterprise'
  ) {
    super(message);
    this.name = 'UpgradeRequiredError';
  }
}

export class LicenseEnforcer {
  private license: LicenseInfo;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'LicenseEnforcer' });
    this.license = this.detectLicense();
    this.logLicenseInfo();
  }

  private detectLicense(): LicenseInfo {
    // Check for enterprise license key
    const licenseKey = process.env.PARALLAX_LICENSE_KEY;
    if (licenseKey) {
      return this.validateLicenseKey(licenseKey);
    }

    // Default to open source - full featured, in-memory only
    return {
      type: 'opensource',
      features: [...OPENSOURCE_FEATURES],
    };
  }

  private validateLicenseKey(key: string): LicenseInfo {
    // License key format: PARALLAX-{TIER}-{RANDOM}
    // Examples: PARALLAX-ENT-a1b2c3d4, PARALLAX-PLUS-x9y8z7w6

    if (key.startsWith('PARALLAX-PLUS-')) {
      return {
        type: 'enterprise-plus',
        validUntil: this.extractExpiry(key) || new Date('2030-12-31'),
        clusterId: this.extractClusterId(key),
        features: [
          ...OPENSOURCE_FEATURES,
          ...ENTERPRISE_ONLY_FEATURES,
        ],
      };
    }

    if (key.startsWith('PARALLAX-ENT-')) {
      // Enterprise gets most features, but not Enterprise Plus exclusives
      const enterprisePlusOnly = ['multi_region', 'advanced_analytics', 'pattern_marketplace', 'priority_support_24_7'];
      return {
        type: 'enterprise',
        validUntil: this.extractExpiry(key) || new Date('2030-12-31'),
        clusterId: this.extractClusterId(key),
        features: [
          ...OPENSOURCE_FEATURES,
          ...ENTERPRISE_ONLY_FEATURES.filter(f => !enterprisePlusOnly.includes(f)),
        ],
      };
    }

    // Legacy format support
    if (key.startsWith('PARALLAX-ENTERPRISE-PLUS-')) {
      return this.validateLicenseKey(key.replace('PARALLAX-ENTERPRISE-PLUS-', 'PARALLAX-PLUS-'));
    }
    if (key.startsWith('PARALLAX-ENTERPRISE-')) {
      return this.validateLicenseKey(key.replace('PARALLAX-ENTERPRISE-', 'PARALLAX-ENT-'));
    }

    this.logger.warn({ key: key.substring(0, 15) + '...' }, 'Invalid license key format');
    return {
      type: 'opensource',
      features: [...OPENSOURCE_FEATURES],
    };
  }

  private extractExpiry(_key: string): Date | undefined {
    // In production, decode from key or check license server
    return undefined;
  }

  private extractClusterId(key: string): string {
    // In production, decode from key
    return `cluster-${key.split('-').pop()?.substring(0, 8) || 'unknown'}`;
  }

  private logLicenseInfo() {
    const banner = this.license.type === 'opensource'
      ? this.getOpenSourceBanner()
      : this.getEnterpriseBanner();

    this.logger.info('\n' + banner);
  }

  private getOpenSourceBanner(): string {
    return `
╔══════════════════════════════════════════════════════════════════╗
║  🎉 Parallax Open Source — Full Power, No Limits!                ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  ✓ Unlimited agents         ✓ All pattern types                 ║
║  ✓ Pattern Builder          ✓ Full Prism DSL                    ║
║  ✓ Complete CLI             ✓ Local execution                   ║
║                                                                  ║
║  Running in-memory mode (state not persisted)                    ║
║                                                                  ║
║  Ready for production? Get persistence, HA & dashboard:          ║
║  → https://parallax.ai/enterprise                                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝`;
  }

  private getEnterpriseBanner(): string {
    const validUntil = this.license.validUntil?.toLocaleDateString() || 'Perpetual';
    const tier = this.license.type === 'enterprise-plus' ? 'Enterprise Plus' : 'Enterprise';
    const support = this.license.type === 'enterprise-plus' ? '24/7 Priority' : 'Business Hours';

    return `
╔══════════════════════════════════════════════════════════════════╗
║  🚀 Parallax ${tier.padEnd(15)}                               ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  License Valid: ${validUntil.padEnd(20)}                         ║
║  Cluster ID:    ${(this.license.clusterId || 'unknown').padEnd(20)}                         ║
║  Support:       ${support.padEnd(20)}                         ║
║                                                                  ║
║  All features enabled including persistence & dashboard          ║
║                                                                  ║
║  Support: enterprise-support@parallax.ai                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝`;
  }

  /**
   * Check if a feature is available in current license
   */
  hasFeature(feature: string): boolean {
    // Open source features are always available
    if (OPENSOURCE_FEATURES.includes(feature)) {
      return true;
    }

    // Enterprise features require license
    return this.license.features.includes(feature);
  }

  /**
   * Require a feature, throwing UpgradeRequiredError if not available
   */
  requireFeature(feature: string, friendlyName?: string): void {
    if (this.hasFeature(feature)) {
      return;
    }

    const name = friendlyName || feature.replace(/_/g, ' ');
    throw new UpgradeRequiredError(
      `${name} requires Parallax Enterprise.\n\n` +
      `This feature enables:\n` +
      `  • Persistent state across restarts\n` +
      `  • Historical data and audit trails\n` +
      `  • Production-ready deployment\n\n` +
      `Start a free 30-day trial: parallax deploy --trial\n` +
      `Learn more: https://parallax.ai/enterprise`,
      feature
    );
  }

  /**
   * Check if current license is enterprise tier
   */
  isEnterprise(): boolean {
    return this.license.type === 'enterprise' || this.license.type === 'enterprise-plus';
  }

  /**
   * Check if current license is enterprise plus tier
   */
  isEnterprisePlus(): boolean {
    return this.license.type === 'enterprise-plus';
  }

  /**
   * Get license type
   */
  getLicenseType(): LicenseType {
    return this.license.type;
  }

  /**
   * Get license info for API responses (safe to expose)
   */
  getLicenseInfo(): { type: LicenseType; features: string[] } {
    return {
      type: this.license.type,
      features: this.license.features,
    };
  }

  /**
   * Get upgrade prompt for CLI/UI display
   */
  getUpgradePrompt(feature?: string): string {
    const featureText = feature
      ? `\n║  Feature requested: ${feature.padEnd(43)}║`
      : '';

    return `
╔══════════════════════════════════════════════════════════════════╗
║  🚀 Upgrade to Parallax Enterprise                               ║
╠══════════════════════════════════════════════════════════════════╣${featureText}
║                                                                  ║
║  Production features include:                                    ║
║  ✓ Persistence      — Execution history & metrics                ║
║  ✓ Web Dashboard    — Real-time monitoring & management          ║
║  ✓ Scheduling       — Cron jobs & event triggers                 ║
║  ✓ High Availability — Clustering & automatic failover           ║
║  ✓ Multi-user       — Teams, RBAC & SSO                          ║
║  ✓ Priority Support — SLA-backed assistance                      ║
║                                                                  ║
║  Start free trial:  parallax deploy --trial                      ║
║  Learn more:        https://parallax.ai/enterprise               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝`;
  }

  /**
   * Log feature access for analytics (non-blocking)
   */
  trackFeatureAccess(feature: string, granted: boolean): void {
    this.logger.debug(
      { feature, granted, license: this.license.type },
      granted ? 'Feature access granted' : 'Feature access denied (upgrade required)'
    );
  }
}
