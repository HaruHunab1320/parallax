# Parallax: Open Source vs Enterprise Edition

## Overview

Parallax follows a proven open-source model where the core platform is free and open, with enterprise features for production scale and governance.

## Open Source Edition (MIT License)

### Core Features
- ✅ **Full Prism Runtime Integration**
- ✅ **All 11+ Coordination Patterns**
- ✅ **Pattern Development & Testing**
- ✅ **Local Development Mode**
- ✅ **Basic Agent SDKs** (TypeScript, Python)
- ✅ **CLI for Local Use**
- ✅ **Single Control Plane Instance**

### Limitations
- **3 Concurrent Agents Maximum** (configurable)
- **In-Memory State Only** (no persistence)
- **No High Availability**
- **No Authentication/Security**
- **No Distributed Execution**
- **Basic Metrics Only**
- **No Web Dashboard**

### Target Users
- Individual developers
- Small teams
- Proof of concepts
- Learning and experimentation
- Open source projects

### Example Usage
```bash
# Open source - runs locally with agent limit
PARALLAX_MAX_AGENTS=3 parallax start

# Trying to use more agents shows friendly message
> "Using 3 of 5 requested agents (Open Source limit). 
> Upgrade to Enterprise for unlimited agents: parallax.ai/enterprise"
```

## Enterprise Edition (Commercial License)

### Core Enterprise Features

#### 1. **Unlimited Agent Orchestration**
- No agent limits
- Kubernetes-native deployment
- Auto-scaling based on load
- Multi-region agent pools

#### 2. **Production Infrastructure**
```yaml
# Enterprise Kubernetes CRDs
apiVersion: parallax.io/v1
kind: AgentPool
metadata:
  name: ml-agents
spec:
  minReplicas: 5
  maxReplicas: 100
  scalingPolicy:
    metric: confidence_requests
    targetValue: 100
```

#### 3. **High Availability**
- Multi-master control plane
- Automatic failover
- Zero-downtime upgrades
- Disaster recovery

#### 4. **Enterprise Security**
- mTLS everywhere
- RBAC with fine-grained permissions
- SSO/SAML integration
- Audit logging
- Secrets management
- Network policies

#### 5. **Advanced Monitoring**
- Full observability stack
- Custom dashboards
- Alerting & on-call integration
- SLA monitoring
- Cost analytics

#### 6. **Web Management Console**
- Visual pattern designer
- Agent fleet management
- Execution monitoring
- Team collaboration
- API key management

### Premium Features (Enterprise+)

#### 1. **Pattern Marketplace**
- Private pattern registry
- Certified patterns
- Version control
- Dependency management

#### 2. **Multi-Tenancy**
- Namespace isolation
- Resource quotas
- Chargeback/showback
- Tenant-specific SLAs

#### 3. **Advanced Analytics**
- ML-powered optimization
- Predictive scaling
- Anomaly detection
- Confidence calibration ML

#### 4. **Professional Services**
- Custom pattern development
- Architecture consulting
- Training & certification
- 24/7 support

## Implementation Strategy

### 1. License Enforcement

**File: `packages/control-plane/src/licensing/enforcer.ts`**

```typescript
export class LicenseEnforcer {
  private readonly MAX_OPEN_SOURCE_AGENTS = 3;
  private licenseType: 'opensource' | 'enterprise';
  
  constructor() {
    this.licenseType = this.detectLicense();
  }
  
  private detectLicense(): 'opensource' | 'enterprise' {
    // Check for enterprise license file
    if (process.env.PARALLAX_LICENSE_KEY) {
      return this.validateLicenseKey(process.env.PARALLAX_LICENSE_KEY);
    }
    
    // Check for Kubernetes deployment
    if (process.env.KUBERNETES_SERVICE_HOST) {
      return this.validateKubernetesLicense();
    }
    
    return 'opensource';
  }
  
  enforceAgentLimit(requestedAgents: Agent[]): Agent[] {
    if (this.licenseType === 'enterprise') {
      return requestedAgents;
    }
    
    if (requestedAgents.length > this.MAX_OPEN_SOURCE_AGENTS) {
      this.logger.info(
        `Using ${this.MAX_OPEN_SOURCE_AGENTS} of ${requestedAgents.length} requested agents ` +
        `(Open Source limit). Upgrade to Enterprise for unlimited agents: parallax.ai/enterprise`
      );
      
      // Track this for conversion metrics
      this.telemetry.track('agent_limit_reached', {
        requested: requestedAgents.length,
        limited_to: this.MAX_OPEN_SOURCE_AGENTS
      });
      
      return requestedAgents.slice(0, this.MAX_OPEN_SOURCE_AGENTS);
    }
    
    return requestedAgents;
  }
  
  checkFeature(feature: string): boolean {
    const enterpriseFeatures = [
      'persistence',
      'high_availability',
      'web_dashboard',
      'multi_region',
      'advanced_analytics',
      'pattern_marketplace',
      'kubernetes_operator'
    ];
    
    if (enterpriseFeatures.includes(feature)) {
      if (this.licenseType !== 'enterprise') {
        this.logger.info(
          `Feature '${feature}' requires Enterprise Edition. ` +
          `Learn more at parallax.ai/enterprise`
        );
        return false;
      }
    }
    
    return true;
  }
}
```

### 2. Graceful Degradation

**File: `packages/control-plane/src/pattern-engine/pattern-engine.ts`**

```typescript
// In executePattern method
const availableAgents = await this.selectAgents(pattern, input);

// Apply license limits
const allowedAgents = this.licenseEnforcer.enforceAgentLimit(availableAgents);

if (allowedAgents.length < availableAgents.length) {
  // Add warning to execution result
  execution.warnings = execution.warnings || [];
  execution.warnings.push({
    type: 'AGENT_LIMIT',
    message: `Pattern performance may be reduced. Using ${allowedAgents.length} of ${availableAgents.length} optimal agents.`,
    upgrade_url: 'https://parallax.ai/enterprise'
  });
}
```

### 3. Feature Flags

**File: `packages/control-plane/src/config/features.ts`**

```typescript
export const FEATURES = {
  // Always available
  CORE_PATTERNS: true,
  LOCAL_AGENTS: true,
  BASIC_CLI: true,
  
  // Enterprise only
  PERSISTENCE: () => licenseEnforcer.checkFeature('persistence'),
  WEB_DASHBOARD: () => licenseEnforcer.checkFeature('web_dashboard'),
  KUBERNETES: () => licenseEnforcer.checkFeature('kubernetes_operator'),
  UNLIMITED_AGENTS: () => licenseEnforcer.isEnterprise(),
  ADVANCED_ANALYTICS: () => licenseEnforcer.checkFeature('advanced_analytics'),
  MULTI_REGION: () => licenseEnforcer.checkFeature('multi_region'),
  PATTERN_MARKETPLACE: () => licenseEnforcer.checkFeature('pattern_marketplace')
};
```

## Pricing Model

### Open Source (Free Forever)
- Full source code access
- Community support
- 3 concurrent agents
- Perfect for development

### Enterprise ($2,500/month per cluster)
- Unlimited agents
- Kubernetes deployment
- High availability
- Email support
- Web dashboard

### Enterprise+ (Custom Pricing)
- Everything in Enterprise
- Multi-region federation
- Advanced analytics
- Professional services
- 24/7 phone support
- Custom development

## Community vs Enterprise Messaging

### For Open Source Users
```
┌─────────────────────────────────────────────────────────┐
│  🎉 Welcome to Parallax Open Source!                    │
│                                                         │
│  You're using the free version with:                   │
│  • Up to 3 concurrent agents                          │
│  • All core patterns                                  │
│  • Local development mode                             │
│                                                         │
│  Need more power? Upgrade to Enterprise:              │
│  • Unlimited agents                                   │
│  • Kubernetes orchestration                           │
│  • High availability                                  │
│  • Professional support                               │
│                                                         │
│  Learn more: parallax.ai/enterprise                   │
└─────────────────────────────────────────────────────────┘
```

### For Enterprise Users
```
┌─────────────────────────────────────────────────────────┐
│  🚀 Parallax Enterprise Edition                         │
│                                                         │
│  License: Valid until 2024-12-31                      │
│  Cluster ID: prod-us-east-1                           │
│  Agent Limit: Unlimited                               │
│  Support Level: 24/7                                  │
│                                                         │
│  Need help? enterprise-support@parallax.ai            │
└─────────────────────────────────────────────────────────┘
```

## Migration Path

### From Open Source to Enterprise

1. **Seamless Upgrade**
   ```bash
   # Install enterprise license
   parallax license install <license-key>
   
   # Deploy to Kubernetes
   parallax deploy kubernetes --license <license-key>
   ```

2. **No Code Changes Required**
   - Same patterns work
   - Same agent code
   - Just more scale and features

3. **Data Migration**
   - Export from local
   - Import to enterprise
   - Zero downtime

## Success Metrics

### Open Source Adoption
- GitHub stars
- Community patterns contributed
- Active developers
- Discord community size

### Enterprise Conversion
- Trial to paid conversion rate
- Agent limit hit frequency
- Feature request patterns
- Support ticket volume

## Marketing Strategy

### Open Source
- "Build AI orchestration locally"
- "Perfect for prototypes"
- "Learn uncertainty-aware patterns"
- "Join the community"

### Enterprise
- "Production-ready AI orchestration"
- "Scale to thousands of agents"
- "Enterprise security and compliance"
- "Professional support included"

This model ensures:
1. **Generous open source offering** that's genuinely useful
2. **Clear value proposition** for enterprise
3. **Natural upgrade path** as users scale
4. **No artificial limitations** that annoy users
5. **Community building** while sustaining development