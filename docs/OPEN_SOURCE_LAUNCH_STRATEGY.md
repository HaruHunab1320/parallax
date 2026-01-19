# Parallax Open Source Launch Strategy

> **Archived**: Superseded by `docs/REVISED_OPENSOURCE_STRATEGY.md`. Kept for historical context.

> **Status**: Future Planning Document  
> **Current State**: Private monorepo in development  
> **Target**: Execute when ready for public launch

## Executive Summary

This document outlines the strategy for transitioning Parallax from a private monorepo to a public open source project with a sustainable business model. The plan uses a modified open core approach that maximizes adoption while protecting commercial viability.

## Current State (Private Development)

### Repository Structure
```
parallax/ (private monorepo)
├── packages/
│   ├── control-plane/      # Core orchestration
│   ├── data-plane/         # Execution engine
│   ├── runtime/            # Core runtime
│   ├── proto/              # Protocol definitions
│   ├── cli/                # Command-line tool
│   ├── sdk-typescript/     # TypeScript SDK
│   ├── sdk-python/         # Python SDK
│   ├── sdk-go/             # Go SDK
│   ├── sdk-rust/           # Rust SDK
│   ├── web-dashboard/      # Management UI
│   ├── k8s-deployment/     # Kubernetes resources
│   ├── monitoring/         # Observability configs
│   ├── security/           # mTLS, certificates
│   ├── auth/               # Authentication/RBAC
│   └── tenant/             # Multi-tenancy
├── patterns/               # Coordination patterns
└── examples/               # Example agents
```

### Development Benefits
- Fast iteration across all components
- Easy refactoring
- Simple testing
- No public scrutiny during early development

## Launch Criteria

### Technical Readiness
- [ ] Stable v1.0 APIs
- [ ] Comprehensive test coverage (>80%)
- [ ] Production deployments working
- [ ] Performance benchmarks published
- [ ] Security audit completed

### Business Readiness
- [ ] 10+ active beta users
- [ ] Clear enterprise feature differentiation
- [ ] Pricing model validated
- [ ] Support processes in place
- [ ] Legal review completed

### Documentation Readiness
- [ ] Complete API documentation
- [ ] Getting started guides
- [ ] Architecture documentation
- [ ] Contributing guidelines
- [ ] License files prepared

## Repository Split Strategy

### Phase 1: Repository Structure

```
github.com/parallax-ai/
├── parallax/               # Main public repo (Apache 2.0 or MIT)
│   ├── sdks/              # All language SDKs
│   ├── patterns/          # Pattern library
│   ├── cli/               # CLI tool
│   ├── proto/             # Protocol definitions
│   ├── examples/          # Example agents
│   └── docs/              # Documentation
│
├── parallax-core/         # Source available (BSL 1.1)
│   ├── control-plane/     # Core orchestration
│   ├── data-plane/        # Execution engine
│   ├── runtime/           # Core runtime
│   └── LICENSE            # Business Source License
│
└── parallax-enterprise/   # Private repo (proprietary)
    ├── web-dashboard/     # Management UI
    ├── k8s-operator/      # Advanced K8s features
    ├── persistence/       # Enterprise persistence adapters
    ├── ha-modules/        # High availability modules
    └── support-tools/     # Customer support tooling
```

### Phase 2: License Structure

#### Fully Open Source (MIT/Apache 2.0)
- All SDKs
- CLI tool
- Pattern library
- Examples
- Documentation
- Protocol definitions

#### Source Available (BSL 1.1)
- Control plane
- Data plane
- Core runtime
- Basic persistence

**BSL Parameters:**
- Change Date: 3 years from release
- Change License: MIT
- Additional Use Grant: Development and testing
- Production Use: Requires commercial license

#### Proprietary (Commercial)
- Web dashboard
- Kubernetes operators
- Enterprise persistence adapters
- HA coordinators
- Advanced monitoring integrations

### Phase 3: Distribution Strategy

#### Open Source Components
```bash
# Available via standard package managers
npm install @parallax/sdk-typescript
pip install parallax-sdk
go get github.com/parallax-ai/parallax/sdk-go
cargo add parallax-sdk

# CLI available via brew, apt, etc.
brew install parallax-cli
```

#### Core Platform
```bash
# Pre-built binaries (source visible)
parallax download core --version latest

# Or build from source (with BSL license)
git clone https://github.com/parallax-ai/parallax-core
cd parallax-core
make build
```

#### Enterprise Components
```bash
# Available to licensed customers
parallax enterprise download --license-key $KEY
```

## Community Building Strategy

### Pre-Launch (Private Beta)
1. Recruit 10-20 beta users
2. Build Discord community
3. Create initial patterns
4. Gather feedback
5. Build testimonials

### Launch Week
1. Blog post: "Introducing Parallax"
2. Hacker News submission
3. Product Hunt launch
4. Tweet thread with demos
5. Conference talk submissions

### Post-Launch
1. Weekly office hours
2. Community pattern contests
3. Contributor recognition
4. Conference sponsorships
5. Technical blog series

## Revenue Protection

### Technical Measures
1. License key validation in enterprise features
2. Telemetry for usage tracking (opt-in)
3. Binary signing for official builds
4. Version compatibility checks

### Legal Measures
1. Trademark registration
2. Clear license headers
3. CLA for contributors
4. Terms of service
5. Privacy policy

### Business Measures
1. Rapid feature development
2. Superior support
3. Hosted cloud offering
4. Professional services
5. Certification program

## Migration Checklist

### 6 Weeks Before Launch
- [ ] Finalize repository structure
- [ ] Complete security audit
- [ ] Prepare license files
- [ ] Set up CI/CD for multiple repos
- [ ] Create binary build pipeline

### 4 Weeks Before Launch
- [ ] Legal review of licenses
- [ ] Set up community infrastructure
- [ ] Prepare launch materials
- [ ] Train support team
- [ ] Beta user testimonials

### 2 Weeks Before Launch
- [ ] Final testing of split repos
- [ ] Documentation review
- [ ] Prepare blog posts
- [ ] Set up package publishing
- [ ] Security disclosure process

### Launch Week
- [ ] Make repositories public
- [ ] Publish packages
- [ ] Announce on all channels
- [ ] Monitor community response
- [ ] Rapid response to issues

## Success Metrics

### Month 1
- 1,000+ GitHub stars
- 100+ Discord members
- 10+ community PRs
- 50+ CLI downloads/day

### Month 3
- 5,000+ GitHub stars
- 500+ Discord members
- 3+ enterprise trials
- 100+ production users

### Month 6
- 10,000+ GitHub stars
- 1,000+ Discord members
- 5+ enterprise customers
- 500+ production deployments

## Risk Mitigation

### Risk: Immediate Forks
**Mitigation**: Strong trademark, rapid innovation, superior support

### Risk: No Adoption
**Mitigation**: Strong beta community, clear value prop, good docs

### Risk: Enterprise Bypass
**Mitigation**: BSL license, continuous enterprise features, cloud offering

### Risk: Community Backlash
**Mitigation**: Generous open source offering, transparent communication

## Decision Points

### Before Split
1. **License Choice**: MIT vs Apache 2.0 for open components
2. **BSL Terms**: Change date and additional use grants
3. **Repository Names**: Branding consistency
4. **Package Namespaces**: NPM, PyPI, etc.
5. **Cloud Offering**: Launch simultaneously?

### After Split
1. **Community Governance**: Foundation or company-led?
2. **Contribution Model**: CLA requirements?
3. **Release Cadence**: How often to release?
4. **LTS Policy**: Long-term support versions?
5. **Certification Program**: When to launch?

## Next Steps

1. **Continue Development**: Focus on building great product
2. **Validate Model**: Test with beta users
3. **Refine Strategy**: Adjust based on feedback
4. **Prepare Assets**: Logos, docs, legal
5. **Execute Launch**: When criteria are met

---

*This is a living document. Update as strategy evolves.*
