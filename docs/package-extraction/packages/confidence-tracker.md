# Confidence Tracker Development Plan

**Package Name:** `@parallax/confidence-tracker`
**Current Location:** `packages/data-plane/src/confidence-tracker/`
**Extraction Difficulty:** Easy
**Estimated Effort:** 3-5 days
**Phase:** 1 (Quick Win)

## Overview

A statistical confidence scoring system with anomaly detection. Tracks confidence metrics over time, calculates trends, and alerts on anomalies like sudden drops or high variance. Supports pluggable storage backends (in-memory, InfluxDB, or custom).

## Current Implementation

```typescript
// packages/data-plane/src/confidence-tracker/

export interface ConfidenceDataPoint {
  agentId: string;
  pattern: string;
  task: string;
  confidence: number;  // 0-1 scale
  timestamp: Date;
  executionId?: string;
  metadata?: Record<string, any>;
}

export interface ConfidenceMetrics {
  agentId: string;
  averageConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  confidenceTrend: 'improving' | 'stable' | 'declining';
  dataPoints: number;
  timeRange: { start: Date; end: Date };
}

export class ConfidenceTracker extends EventEmitter {
  async recordConfidence(dataPoint: ConfidenceDataPoint): Promise<void>
  async getMetrics(agentId: string, timeRange?: TimeRange): Promise<ConfidenceMetrics>
  getActiveAlerts(): ConfidenceAnomalyAlert[]
  async getHistoricalData(agentId: string, interval: string): Promise<AggregatedData[]>
}
```

## Target API

```typescript
// @parallax/confidence-tracker

import {
  ConfidenceTracker,
  InMemoryStore,
  InfluxDBStore
} from '@parallax/confidence-tracker';

// Basic usage with in-memory store
const tracker = new ConfidenceTracker({
  store: new InMemoryStore({ maxDataPoints: 10000 }),
  anomalyDetection: {
    enabled: true,
    suddenDropThreshold: 0.3,    // Alert if confidence drops 30%+
    lowConfidenceThreshold: 0.5, // Alert if below 50%
    highVarianceThreshold: 0.25, // Alert if variance exceeds 25%
    checkIntervalMs: 60000,      // Check every minute
  }
});

// Record confidence scores
await tracker.record({
  entityId: 'agent-123',        // Generic entity (was agentId)
  category: 'code-review',      // Generic category (was pattern)
  task: 'review-pr-456',
  confidence: 0.85,
  metadata: { language: 'typescript' }
});

// Get metrics
const metrics = await tracker.getMetrics('agent-123', {
  start: new Date(Date.now() - 86400000), // Last 24h
  end: new Date()
});

// Get historical data
const hourly = await tracker.getHistoricalData('agent-123', 'hour');

// Listen for anomalies
tracker.on('anomaly', (alert) => {
  console.log(`Alert: ${alert.type} for ${alert.entityId}`);
  // { type: 'sudden_drop', entityId, severity, details }
});

// With InfluxDB for production
const prodTracker = new ConfidenceTracker({
  store: new InfluxDBStore({
    url: 'http://localhost:8086',
    token: process.env.INFLUX_TOKEN,
    org: 'parallax',
    bucket: 'confidence',
  }),
  anomalyDetection: { enabled: true }
});
```

## Development Phases

### Phase 1: Core Extraction (Day 1)

- [ ] Create package structure
- [ ] Extract core `ConfidenceTracker` class
- [ ] Generalize naming (`agentId` → `entityId`, `pattern` → `category`)
- [ ] Extract `InMemoryStore` implementation
- [ ] Define `ConfidenceStore` interface

### Phase 2: Storage Backends (Day 2)

- [ ] Implement `ConfidenceStore` interface
- [ ] Port `InfluxDBStore` with optional dependency
- [ ] Add `FileStore` for simple persistence
- [ ] Add store factory with auto-detection

```typescript
interface ConfidenceStore {
  record(dataPoint: ConfidenceDataPoint): Promise<void>;
  query(entityId: string, timeRange: TimeRange): Promise<ConfidenceDataPoint[]>;
  aggregate(entityId: string, interval: AggregateInterval): Promise<AggregatedData[]>;
  getLatest(entityId: string, limit: number): Promise<ConfidenceDataPoint[]>;
  prune(before: Date): Promise<number>;
}
```

### Phase 3: Anomaly Detection (Day 3)

- [ ] Extract anomaly detection algorithms
- [ ] Make thresholds configurable per entity
- [ ] Add trend calculation (linear regression)
- [ ] Add variance calculation
- [ ] Add alert deduplication/cooldown

### Phase 4: Testing (Day 4)

- [ ] Unit tests for metric calculations
- [ ] Unit tests for anomaly detection
- [ ] Integration tests with InfluxDB (optional)
- [ ] Performance tests (10k+ data points)
- [ ] Memory leak tests for in-memory store

### Phase 5: Documentation & Publish (Day 5)

- [ ] Write comprehensive README
- [ ] Add JSDoc comments
- [ ] Create examples for common use cases
- [ ] Configure npm publish
- [ ] Publish v1.0.0

## Package Structure

```
@parallax/confidence-tracker/
├── src/
│   ├── index.ts                  # Public exports
│   ├── confidence-tracker.ts     # Main class
│   ├── types.ts                  # TypeScript interfaces
│   ├── anomaly-detector.ts       # Anomaly detection logic
│   ├── trend-calculator.ts       # Statistical trend analysis
│   └── stores/
│       ├── store.interface.ts    # Store interface
│       ├── memory.store.ts       # In-memory implementation
│       ├── influxdb.store.ts     # InfluxDB implementation
│       └── file.store.ts         # File-based persistence
├── tests/
│   ├── confidence-tracker.test.ts
│   ├── anomaly-detector.test.ts
│   ├── stores/
│   │   ├── memory.store.test.ts
│   │   └── influxdb.store.test.ts
│   └── integration/
│       └── full-workflow.test.ts
├── examples/
│   ├── basic-usage.ts
│   ├── with-influxdb.ts
│   ├── custom-store.ts
│   └── anomaly-alerts.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## API Reference

### `ConfidenceTracker`

```typescript
class ConfidenceTracker extends EventEmitter {
  constructor(config: ConfidenceTrackerConfig)

  /** Record a confidence data point */
  record(dataPoint: ConfidenceDataPoint): Promise<void>

  /** Get aggregated metrics for an entity */
  getMetrics(entityId: string, timeRange?: TimeRange): Promise<ConfidenceMetrics>

  /** Get historical data with time bucketing */
  getHistoricalData(
    entityId: string,
    interval: 'minute' | 'hour' | 'day'
  ): Promise<AggregatedData[]>

  /** Get all active anomaly alerts */
  getActiveAlerts(): ConfidenceAnomalyAlert[]

  /** Acknowledge and dismiss an alert */
  acknowledgeAlert(alertId: string): void

  /** Shutdown and cleanup */
  shutdown(): Promise<void>
}
```

### `ConfidenceDataPoint`

```typescript
interface ConfidenceDataPoint {
  /** Unique identifier for the entity being tracked */
  entityId: string;

  /** Category or type of task (e.g., 'code-review', 'testing') */
  category: string;

  /** Specific task identifier */
  task: string;

  /** Confidence score from 0 to 1 */
  confidence: number;

  /** When this score was recorded (defaults to now) */
  timestamp?: Date;

  /** Optional execution or session ID for correlation */
  correlationId?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
```

### `ConfidenceAnomalyAlert`

```typescript
interface ConfidenceAnomalyAlert {
  id: string;
  entityId: string;
  type: 'sudden_drop' | 'consistently_low' | 'high_variance';
  severity: 'low' | 'medium' | 'high';
  detectedAt: Date;
  details: {
    currentConfidence: number;
    historicalAverage: number;
    deviation: number;
    dataPointsAnalyzed: number;
  };
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `anomaly` | `ConfidenceAnomalyAlert` | Anomaly detected |
| `anomaly:resolved` | `{ alertId, entityId }` | Anomaly resolved |
| `recorded` | `ConfidenceDataPoint` | Data point recorded |
| `metrics:updated` | `{ entityId, metrics }` | Metrics recalculated |

## Storage Backends

### InMemoryStore

Fast, no dependencies, but data lost on restart.

```typescript
const store = new InMemoryStore({
  maxDataPoints: 10000,        // Per entity
  pruneIntervalMs: 60000,      // Cleanup interval
  retentionMs: 86400000 * 7,   // 7 days
});
```

### InfluxDBStore

Production-ready time-series storage.

```typescript
const store = new InfluxDBStore({
  url: 'http://localhost:8086',
  token: process.env.INFLUX_TOKEN,
  org: 'my-org',
  bucket: 'confidence',
  precision: 'ms',
});
```

### FileStore

Simple JSON file persistence for development.

```typescript
const store = new FileStore({
  directory: './data/confidence',
  maxEntriesPerFile: 1000,
});
```

### Custom Store

Implement the `ConfidenceStore` interface:

```typescript
import { ConfidenceStore } from '@parallax/confidence-tracker';

class RedisStore implements ConfidenceStore {
  async record(dataPoint) { /* ... */ }
  async query(entityId, timeRange) { /* ... */ }
  async aggregate(entityId, interval) { /* ... */ }
  async getLatest(entityId, limit) { /* ... */ }
  async prune(before) { /* ... */ }
}
```

## Migration Guide

### Before (Parallax Internal)

```typescript
import { ConfidenceTracker } from '../confidence-tracker';
import { ConfidenceConfig } from '../confidence-tracker/config';

const tracker = new ConfidenceTracker(config, logger);

await tracker.recordConfidence({
  agentId: 'agent-1',
  pattern: 'code-review',
  task: 'review',
  confidence: 0.85,
  timestamp: new Date(),
  executionId: 'exec-123',
});
```

### After (@parallax/confidence-tracker)

```typescript
import { ConfidenceTracker, InMemoryStore } from '@parallax/confidence-tracker';

const tracker = new ConfidenceTracker({
  store: new InMemoryStore(),
  anomalyDetection: { enabled: true },
});

await tracker.record({
  entityId: 'agent-1',      // renamed from agentId
  category: 'code-review',  // renamed from pattern
  task: 'review',
  confidence: 0.85,
  correlationId: 'exec-123', // renamed from executionId
});
```

## Dependencies

**Runtime:**
- `events` (Node.js built-in)

**Optional:**
- `@influxdata/influxdb-client` (for InfluxDB store)

**Development:**
- `typescript` ^5.0.0
- `vitest` ^2.0.0
- `tsup` (bundling)

## Use Cases

1. **AI Agent Quality Tracking** - Monitor confidence scores across different tasks
2. **ML Model Drift Detection** - Track prediction confidence over time
3. **SLO Monitoring** - Track service reliability scores
4. **Quality Assurance** - Monitor test confidence/coverage metrics
5. **User Feedback Scoring** - Track satisfaction/confidence scores

## Success Criteria

- [ ] Pluggable storage backends
- [ ] 100% test coverage
- [ ] TypeScript types included
- [ ] Works in Node.js 18+
- [ ] < 20KB minified (core)
- [ ] InfluxDB support (optional dep)
- [ ] Comprehensive anomaly detection
- [ ] Sub-millisecond recording performance
