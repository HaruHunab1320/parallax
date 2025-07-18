# Package Reorganization Plan

## Current Issues

1. **@parallax/sdk-typescript** contains:
   - ✅ TypeScript SDK code (correct)
   - ❌ Web dashboard application
   - ❌ Kubernetes resources (Helm charts, CRDs, operators)
   - ❌ Monitoring configurations (Grafana, Prometheus)

2. **Multiple architecture documents** with overlapping content:
   - SYSTEM_ARCHITECTURE.md
   - PARALLAX_ARCHITECTURE.md
   - PACKAGE_ARCHITECTURE.md

## Proposed Package Structure

### 1. Clean up @parallax/sdk-typescript
**Keep only SDK-related files:**
```
packages/sdk-typescript/
├── src/
│   ├── agent-base.ts
│   ├── agent.ts
│   ├── decorators.ts
│   ├── index.ts
│   ├── patterns.ts
│   ├── secure-agent.ts
│   ├── server.ts
│   └── types/
├── __tests__/
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Create @parallax/web-dashboard
**Move web application:**
```
packages/web-dashboard/
├── public/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── services/
│   └── utils/
├── package.json
├── tsconfig.json
├── vite.config.ts (or next.config.js)
└── README.md
```

**Dependencies to add:**
- React/Vue/Next.js (whichever is used)
- @parallax/sdk-typescript (for types)
- UI component library
- WebSocket client for real-time updates

### 3. Create @parallax/k8s-deployment
**Move Kubernetes resources:**
```
packages/k8s-deployment/
├── helm/
│   └── parallax/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── templates/
│       └── crds/
├── operators/
│   └── parallax-operator/
├── examples/
│   ├── simple-deployment.yaml
│   └── production-deployment.yaml
├── kustomize/
│   ├── base/
│   └── overlays/
└── README.md
```

### 4. Create @parallax/monitoring
**Move observability configs:**
```
packages/monitoring/
├── grafana/
│   ├── dashboards/
│   │   ├── agent-performance.json
│   │   ├── pattern-execution.json
│   │   └── system-overview.json
│   └── provisioning/
├── prometheus/
│   ├── prometheus.yml
│   └── rules/
├── jaeger/
│   └── jaeger-config.yaml
├── docker-compose.monitoring.yml
└── README.md
```

## Migration Steps

### Phase 1: Create New Packages
```bash
# 1. Create package directories
mkdir -p packages/web-dashboard
mkdir -p packages/k8s-deployment  
mkdir -p packages/monitoring

# 2. Move files (preserving git history)
git mv packages/sdk-typescript/apps/web-dashboard/* packages/web-dashboard/
git mv packages/sdk-typescript/k8s/* packages/k8s-deployment/
git mv packages/sdk-typescript/monitoring/* packages/monitoring/

# 3. Clean up empty directories
rm -rf packages/sdk-typescript/apps
rm -rf packages/sdk-typescript/k8s
rm -rf packages/sdk-typescript/monitoring
```

### Phase 2: Update Package Configurations

#### packages/web-dashboard/package.json
```json
{
  "name": "@parallax/web-dashboard",
  "version": "0.1.0",
  "description": "Web dashboard for Parallax AI orchestration platform",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@parallax/sdk-typescript": "workspace:*",
    "react": "^18.0.0",
    "next": "^14.0.0"
  }
}
```

#### packages/k8s-deployment/package.json
```json
{
  "name": "@parallax/k8s-deployment",
  "version": "0.1.0",
  "description": "Kubernetes deployment resources for Parallax",
  "private": true,
  "scripts": {
    "lint:helm": "helm lint helm/parallax",
    "package:helm": "helm package helm/parallax",
    "validate:k8s": "kubectl --dry-run=client -f examples/"
  }
}
```

#### packages/monitoring/package.json
```json
{
  "name": "@parallax/monitoring",
  "version": "0.1.0",
  "description": "Monitoring and observability configurations for Parallax",
  "private": true,
  "scripts": {
    "validate:dashboards": "node scripts/validate-dashboards.js",
    "start:local": "docker-compose -f docker-compose.monitoring.yml up"
  }
}
```

### Phase 3: Update Dependencies

1. **Update root package.json workspaces:**
```json
{
  "workspaces": [
    "packages/*"
  ]
}
```

2. **Update imports in any files referencing moved code**

3. **Update CI/CD pipelines to handle new packages**

### Phase 4: Documentation Updates

1. **Update READMEs** in each new package
2. **Consolidate architecture docs** (see next section)
3. **Update development setup guides**

## Benefits

1. **Clear Separation of Concerns**
   - SDK package only contains SDK code
   - Web dashboard can evolve independently
   - K8s resources versioned separately
   - Monitoring configs managed independently

2. **Better Development Experience**
   - Can work on dashboard without SDK knowledge
   - K8s experts can improve deployments
   - Monitoring can be customized per deployment

3. **Flexible Deployment**
   - Can deploy dashboard separately
   - K8s resources optional for non-K8s deployments
   - Monitoring stack can be customized

4. **Cleaner Dependencies**
   - SDK has minimal dependencies
   - Dashboard can use any UI framework
   - No mixing of runtime and deployment concerns

## Timeline

- **Day 1**: Create new package structures
- **Day 2**: Move files and update configurations
- **Day 3**: Test each package independently
- **Day 4**: Update documentation
- **Day 5**: Update CI/CD and deployment guides

## Risks and Mitigations

1. **Risk**: Breaking existing imports
   - **Mitigation**: Search for all imports before moving

2. **Risk**: CI/CD pipeline failures
   - **Mitigation**: Update pipelines as part of migration

3. **Risk**: Lost git history
   - **Mitigation**: Use `git mv` to preserve history