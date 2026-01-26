# Agent Hosting Strategy

This document describes how Parallax hosts and manages agent runtimes. Parallax now supports interactive CLI agent sessions via a dedicated Agent Runtime layer.

## Agent Runtime Layer
The Agent Runtime is responsible for:
- Spawning PTY-backed CLI sessions (claude, codex, gemini, aider).
- Handling interactive login prompts and "human-in-the-loop" approvals.
- Registering agents with the Parallax registry.

See `docs/AGENT_RUNTIME_SUPPORT_DEVELOPMENT.md` for the full roadmap.

## Hosting Modes
1) Local Runtime (MVP)
   - A runtime daemon on a developer machine or VM.
   - Best for fast iteration and auth flows.
2) Parallax Cloud (Managed K8s)
   - Parallax provisions per-agent containers.
   - Best for enterprise scale, isolation, and reliability.
3) Customer VPC / Self-Hosted
   - Runtime deployed to a customer-controlled cluster.

> **Status:** Future Development (Post-Launch)
> **Priority:** Low - Build only if customer demand validates
> **Last Updated:** January 2025

## Executive Summary

This document outlines a potential future expansion of Parallax from **orchestration-only** to **orchestration + hosting**. This is NOT part of the current product and should only be built after:

1. Core product launches successfully
2. Paying customers explicitly request hosted agents
3. Business case justifies the operational complexity

---

## Current Architecture: BYOA (Bring Your Own Agent)

```
┌─────────────────────────────────────────────────────────────────┐
│  Customer Infrastructure                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Agent A     │  │ Agent B     │  │ Agent C     │              │
│  │ (customer)  │  │ (customer)  │  │ (customer)  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │ gRPC           │ gRPC           │ gRPC
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Parallax Control Plane (Customer or Parallax Infrastructure)   │
│  - Agent registry                                                │
│  - Pattern orchestration                                         │
│  - Execution management                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Current Value Proposition:**
- Customers write agents in any language (TS, Python, Rust, Go)
- Customers host agents wherever they want
- Parallax orchestrates patterns across agents
- Enterprise features for production (HA, scheduling, monitoring)

---

## Proposed Architecture: Hosted Agents

```
┌─────────────────────────────────────────────────────────────────┐
│  Parallax Platform                                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Control Plane                                            │    │
│  │ - Agent registry                                         │    │
│  │ - Pattern orchestration                                  │    │
│  │ - Execution management                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│           │                                                      │
│           │ manages                                              │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Agent Hosting Layer (NEW)                                │    │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │    │
│  │ │ Agent A │ │ Agent B │ │ Agent C │ │ Agent D │         │    │
│  │ │ (TS)    │ │ (Python)│ │ (Rust)  │ │ (Go)    │         │    │
│  │ └─────────┘ └─────────┘ └─────────┘ └─────────┘         │    │
│  │      ↑           ↑           ↑           ↑               │    │
│  │      └───────────┴───────────┴───────────┘               │    │
│  │                    Auto-scaling                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  + External agents still supported (BYOA)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Why Consider This?

### Customer Pain Points (Hypothetical)

1. **"I don't want to manage infrastructure"**
   - Running agents requires K8s knowledge
   - Scaling is complex
   - Monitoring across distributed agents is hard

2. **"I want turnkey deployment"**
   - Upload code, it just works
   - Auto-scaling built in
   - Logs/metrics aggregated

3. **"I need guaranteed performance"**
   - SLA on agent availability
   - Predictable latency
   - No cold starts

### When NOT to Build This

- If customers are happy with BYOA
- If the operational burden outweighs revenue
- If security concerns (running untrusted code) are too high
- If it distracts from core orchestration product

---

## Technical Implementation

### Prerequisites (Already Built)

| Component | Status | Notes |
|-----------|--------|-------|
| Kubernetes deployment | ✅ | Helm charts exist |
| Agent SDKs (4 languages) | ✅ | TS, Python, Rust, Go |
| gRPC service definitions | ✅ | Proto files exist |
| Agent registration | ✅ | Control plane accepts registrations |
| HPA for scaling | ✅ | K8s templates exist |

### What Needs to Be Built

#### 1. Agent Deployment API

```typescript
// New API endpoints
POST   /api/agents/deploy     // Deploy an agent
GET    /api/agents/:id/status // Get deployment status
DELETE /api/agents/:id        // Undeploy agent
PUT    /api/agents/:id/scale  // Manual scale
GET    /api/agents/:id/logs   // Stream logs
```

**Estimated effort:** 1-2 weeks

#### 2. Kubernetes Operator

The Helm templates already define an operator structure. Need to implement:

```typescript
// packages/operator/src/controllers/agent-controller.ts
class AgentController {
  // Watch for ParallaxAgent CRDs
  async onAgentCreated(agent: ParallaxAgent) {
    // 1. Create Deployment
    // 2. Create Service
    // 3. Create HPA
    // 4. Wait for ready
    // 5. Agent auto-registers with control plane
  }

  async onAgentDeleted(agent: ParallaxAgent) {
    // 1. Delete HPA
    // 2. Delete Service
    // 3. Delete Deployment
    // 4. Unregister from control plane
  }

  async onAgentUpdated(agent: ParallaxAgent) {
    // Rolling update of deployment
  }
}
```

**Estimated effort:** 2-3 weeks

#### 3. Multi-Language Build System

Users upload code, we build container images:

```yaml
# Detected from source or specified
language: typescript  # or python, rust, go

# We generate appropriate Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "dist/index.js"]
```

Options:
- **Cloud Build** (GCP) / **CodeBuild** (AWS) - managed
- **Kaniko** - in-cluster builds
- **Buildpacks** - auto-detect language

**Estimated effort:** 2-3 weeks

#### 4. Dashboard UI for Agent Management

```
┌─────────────────────────────────────────────────────────────────┐
│ Hosted Agents                                          [Deploy] │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ sentiment-analyzer                                          │ │
│ │ Language: TypeScript  │  Replicas: 3/3  │  Status: Healthy  │ │
│ │ CPU: 45%  │  Memory: 128MB  │  Requests: 1.2k/min          │ │
│ │ [Scale] [Logs] [Redeploy] [Delete]                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ document-classifier                                         │ │
│ │ Language: Python  │  Replicas: 2/2  │  Status: Healthy      │ │
│ │ CPU: 23%  │  Memory: 256MB  │  Requests: 450/min           │ │
│ │ [Scale] [Logs] [Redeploy] [Delete]                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Estimated effort:** 1-2 weeks

#### 5. Billing & Metering

Track compute usage per customer:

```typescript
interface AgentUsage {
  agentId: string;
  customerId: string;
  cpuSeconds: number;
  memoryGBSeconds: number;
  requestCount: number;
  periodStart: Date;
  periodEnd: Date;
}
```

Integration with Stripe/billing system.

**Estimated effort:** 2-3 weeks

---

## Total Estimated Effort

| Component | Effort |
|-----------|--------|
| Agent Deployment API | 1-2 weeks |
| Kubernetes Operator | 2-3 weeks |
| Multi-Language Build | 2-3 weeks |
| Dashboard UI | 1-2 weeks |
| Billing/Metering | 2-3 weeks |
| Testing & Polish | 2 weeks |
| **Total** | **10-15 weeks** |

---

## Operational Considerations

### Security

| Risk | Mitigation |
|------|------------|
| Running untrusted code | Container isolation, gVisor/Firecracker |
| Resource exhaustion | CPU/memory limits, quotas per customer |
| Network attacks | Network policies, no egress by default |
| Secret exposure | Vault integration, no env var secrets |

### Multi-Tenancy

| Approach | Pros | Cons |
|----------|------|------|
| Namespace per customer | Strong isolation | More overhead |
| Shared namespace + Network Policies | Efficient | Weaker isolation |
| Dedicated clusters | Strongest isolation | Expensive |

**Recommendation:** Namespace per customer with Network Policies

### Pricing Model

| Option | Description |
|--------|-------------|
| Per-agent | $X/month per deployed agent |
| Compute-based | $X per CPU-hour + $Y per GB-hour |
| Request-based | $X per 1M requests |
| Tiered | Included agents + overage |

**Recommendation:** Compute-based with minimum commitment

---

## Decision Framework

### Build Agent Hosting If:

- [ ] 10+ enterprise customers request it unprompted
- [ ] Competitors offer it and we're losing deals
- [ ] Revenue potential > operational cost
- [ ] We have dedicated DevOps capacity

### Don't Build If:

- [ ] Customers are happy with BYOA
- [ ] Security/compliance concerns are blockers
- [ ] Core product needs more work
- [ ] Small team can't support it

---

## Phased Rollout (If We Proceed)

### Phase 1: Internal Alpha
- Build operator and basic deployment
- Test with internal agents only
- No billing, no multi-tenant

### Phase 2: Private Beta
- Invite 3-5 trusted customers
- Single language (TypeScript only)
- Manual scaling only
- Free during beta

### Phase 3: Public Beta
- All 4 languages
- Auto-scaling
- Basic billing
- Namespace isolation

### Phase 4: GA
- Full multi-tenancy
- SLA guarantees
- Advanced security (gVisor)
- Full billing integration

---

## Conclusion

Agent hosting is a significant expansion that transforms Parallax from an orchestration platform to a compute platform. It should only be pursued if:

1. **Customer demand is clear** - Multiple paying customers ask for it
2. **Business case is strong** - Revenue > operational cost
3. **Team capacity exists** - Dedicated DevOps/SRE resources

For now, focus on launching the orchestration product. The BYOA model with excellent SDKs covers most use cases. Revisit this document when we have market feedback.

---

## Related Documents

- `LICENSING_STRATEGY.md` - Current enterprise feature set
- `k8s/helm/parallax/` - Existing Helm charts (operator scaffolding)
- `packages/sdk-*/` - Agent SDKs for all languages
