# Pi 5 + Cloud Agent Coordination Demo

Demonstrates both Parallax agent models working together:

- **Managed agent** — spawned by the K8s runtime as a pod in GKE
- **Self-registering agent** — runs on a Raspberry Pi 5, registers via gRPC

## Architecture

```
┌──────────────────────────────────────────┐
│              GKE Cluster                 │
│                                          │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │ Control Plane│  │ K8s Runtime      │  │
│  │  :3000 :8081 │  │  :9878           │  │
│  └──────┬───────┘  └────────┬─────────┘  │
│         │                   │            │
│         │     ┌─────────────┘            │
│         │     │  (spawns)                │
│         │     ▼                          │
│         │  ┌──────────────────┐          │
│         │  │ Managed Agent    │          │
│         │  │  :8080           │          │
│         │  └──────────────────┘          │
│         │                                │
│  ┌──────┴──────────┐                     │
│  │ gRPC LB :8081   │                     │
│  └──────┬──────────┘                     │
└─────────┼────────────────────────────────┘
          │  (registers)
          ▼
   ┌──────────────┐
   │  Pi 5 Agent  │
   │  (edge)      │
   └──────────────┘
```

## Prerequisites

1. GKE cluster with Parallax deployed (control plane + runtime-k8s)
2. Raspberry Pi 5 with Node.js 20+
3. Network path from Pi to the gRPC LoadBalancer IP

## Setup

### 1. Deploy K8s Runtime

```bash
# Apply CRD
kubectl apply -f packages/runtime-k8s/crds/parallax-agent.yaml

# Apply RBAC and deployment
kubectl apply -f k8s/runtime-k8s-rbac.yaml
kubectl apply -f k8s/runtime-k8s-deployment.yaml

# Expose gRPC for external agents
kubectl apply -f k8s/control-plane-grpc-lb.yaml
```

### 2. Build & Push Images

```bash
# Runtime K8s
docker buildx build -t gcr.io/parallax-466513/parallax-runtime-k8s:latest \
  -f packages/runtime-k8s/Dockerfile --push .

# Demo agent
cd demos/pi-demo/managed-agent
docker buildx build -t gcr.io/parallax-466513/parallax-agent-demo:latest --push .
```

### 3. Start Pi 5 Agent

```bash
# On the Pi 5
cd demos/pi-demo/pi5-agent
npm install
npm run build

# Get the gRPC LB external IP
GRPC_IP=$(kubectl get svc parallax-control-plane-grpc -n parallax -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# If Pi is behind NAT, use ngrok or cloudflare tunnel
# ngrok tcp 50051

export PARALLAX_REGISTRY="${GRPC_IP}:8081"
export PARALLAX_AGENT_HOST="<pi-public-ip-or-tunnel>"
npm start
```

### 4. Run the Coordination Pattern

```bash
curl -X POST http://<control-plane>/api/patterns/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "pattern": "EdgeCloudCoordination",
    "input": {
      "task": "Benchmark compute and collect system metrics",
      "data": {}
    }
  }'
```

## Directory Structure

```
demos/pi-demo/
├── managed-agent/       # HTTP agent image for K8s spawning
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── pi5-agent/           # Standalone gRPC agent for Pi 5
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── patterns/
│   └── coordinate.prism # Coordination pattern for both agents
└── README.md
```

## Verification

1. `kubectl get pods -n parallax` — runtime-k8s pod is running
2. `kubectl get pods -n parallax-agents` — managed agent pod appears after spawn
3. `curl <control-plane>/api/agents` — both agents listed
4. Execute pattern — results include cloud and edge agent responses
