import { Logger } from 'pino';
import { Agent } from '@parallax/runtime';

export interface LicenseInfo {
  type: 'opensource' | 'enterprise' | 'enterprise-plus';
  validUntil?: Date;
  clusterId?: string;
  maxAgents?: number;
  features: string[];
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

    // Check if running in Kubernetes (enterprise indicator)
    if (process.env.KUBERNETES_SERVICE_HOST) {
      this.logger.warn(
        'Running in Kubernetes without license key. ' +
        'Please set PARALLAX_LICENSE_KEY for enterprise features.'
      );
    }

    // Default to open source
    return {
      type: 'opensource',
      features: ['core_patterns', 'local_agents', 'basic_cli']
    };
  }

  private validateLicenseKey(key: string): LicenseInfo {
    // In production, this would validate against a license server
    // For now, simple check for demo
    if (key.startsWith('PARALLAX-ENTERPRISE-')) {
      return {
        type: 'enterprise',
        validUntil: new Date('2025-12-31'),
        clusterId: 'demo-cluster',
        features: [
          'core_patterns',
          'local_agents', 
          'basic_cli',
          'unlimited_agents',
          'persistence',
          'high_availability',
          'web_dashboard',
          'kubernetes_operator',
          'email_support'
        ]
      };
    }

    if (key.startsWith('PARALLAX-ENTERPRISE-PLUS-')) {
      return {
        type: 'enterprise-plus',
        validUntil: new Date('2025-12-31'),
        clusterId: 'premium-cluster',
        features: [
          'core_patterns',
          'local_agents',
          'basic_cli', 
          'unlimited_agents',
          'persistence',
          'high_availability',
          'web_dashboard',
          'kubernetes_operator',
          'email_support',
          'multi_region',
          'advanced_analytics',
          'pattern_marketplace',
          'phone_support'
        ]
      };
    }

    this.logger.warn('Invalid license key provided');
    return this.detectLicense(); // Fall back to open source
  }

  private logLicenseInfo() {
    const banner = this.license.type === 'opensource' 
      ? this.getOpenSourceBanner()
      : this.getEnterpriseBanner();
    
    this.logger.info('\n' + banner);
  }

  private getOpenSourceBanner(): string {
    return `┌─────────────────────────────────────────────────────────┐
│  🎉 Welcome to Parallax Open Source!                    │
│                                                         │
│  You're using the free version with:                   │
│  • Unlimited local agents                             │
│  • All core patterns                                  │
│  • Local development mode                             │
│                                                         │
│  Want enterprise features? Upgrade for:               │
│  • Kubernetes orchestration                           │
│  • High availability & persistence                    │
│  • Web dashboard & monitoring                         │
│  • Professional support                               │
│                                                         │
│  Learn more: parallax.ai/enterprise                   │
└─────────────────────────────────────────────────────────┘`;
  }

  private getEnterpriseBanner(): string {
    const validUntil = this.license.validUntil?.toLocaleDateString() || 'Perpetual';
    const supportLevel = this.license.type === 'enterprise-plus' ? '24/7' : 'Business Hours';
    
    return `┌─────────────────────────────────────────────────────────┐
│  🚀 Parallax Enterprise Edition                         │
│                                                         │
│  License: Valid until ${validUntil.padEnd(32)}│
│  Cluster ID: ${(this.license.clusterId || 'unknown').padEnd(42)}│
│  Agent Limit: Unlimited                               │
│  Support Level: ${supportLevel.padEnd(38)}│
│                                                         │
│  Need help? enterprise-support@parallax.ai            │
└─────────────────────────────────────────────────────────┘`;
  }

  /**
   * Check agent availability (no limits in open source)
   */
  enforceAgentLimit(requestedAgents: Agent[]): Agent[] {
    // No agent limits for any license type
    return requestedAgents;
  }

  /**
   * Check if a feature is available in current license
   */
  hasFeature(feature: string): boolean {
    // Define enterprise-only features (infrastructure & operations)
    const enterpriseFeatures = [
      'kubernetes_operator',
      'high_availability', 
      'persistence',
      'web_dashboard',
      'multi_region',
      'advanced_analytics',
      'pattern_marketplace',
      'scheduled_patterns',
      'audit_logging',
      'sso_integration',
      'mtls_security',
      'rbac',
      'backup_restore'
    ];
    
    // Open source gets all core features
    if (!enterpriseFeatures.includes(feature)) {
      return true;
    }
    
    // Check if enterprise license has the feature
    const available = this.license.features.includes(feature);
    
    if (!available && enterpriseFeatures.includes(feature)) {
      this.logger.debug(
        { feature, license: this.license.type },
        `Feature '${feature}' requires Enterprise Edition. Learn more at parallax.ai/enterprise`
      );
    }

    return available;
  }

  /**
   * Check if current license is enterprise
   */
  isEnterprise(): boolean {
    return this.license.type === 'enterprise' || this.license.type === 'enterprise-plus';
  }

  /**
   * Get license info for API responses
   */
  getLicenseInfo(): Partial<LicenseInfo> {
    return {
      type: this.license.type,
      features: this.license.features
    };
  }

  private getUpgradePrompt(): string {
    return `┌─────────────────────────────────────────────────────────┐
│  🚀 Ready for production?                               │
│                                                         │
│  Parallax Enterprise offers:                           │
│  ✓ Kubernetes-native deployment                       │
│  ✓ High availability & persistence                    │
│  ✓ Web dashboard & monitoring                         │
│  ✓ Professional support                               │
│  ✓ Advanced security (mTLS, RBAC, SSO)               │
│  ✓ Multi-region federation                            │
│                                                         │
│  Start your 30-day trial:                             │
│  > parallax upgrade trial                             │
│                                                         │
│  Or learn more:                                       │
│  > parallax.ai/enterprise                             │
└─────────────────────────────────────────────────────────┘`;
  }

  /**
   * Track feature usage for analytics
   */
  trackFeatureUsage(feature: string, allowed: boolean) {
    // In production, this would send telemetry
    this.logger.debug(
      { feature, allowed, license: this.license.type },
      'Feature usage tracked'
    );
  }
}