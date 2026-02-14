# @parallax/confidence-tracker

Statistical confidence tracking with anomaly detection for AI agents and ML systems.

## Features

- **Track confidence scores** over time for any entity
- **Anomaly detection** - Sudden drops, low confidence, high variance
- **Trend analysis** - Improving, stable, or declining
- **Pluggable storage** - In-memory, InfluxDB, or custom
- **Event-driven** - Subscribe to anomalies and metrics updates
- **TypeScript first** - Full type definitions included

## Installation

```bash
npm install @parallax/confidence-tracker
# or
pnpm add @parallax/confidence-tracker
# or
yarn add @parallax/confidence-tracker
```

## Quick Start

```typescript
import { ConfidenceTracker, InMemoryStore } from '@parallax/confidence-tracker';

const tracker = new ConfidenceTracker({
  store: new InMemoryStore({ maxDataPoints: 10000 }),
  anomalyDetection: {
    enabled: true,
    suddenDropThreshold: 0.3,      // Alert if confidence drops 30%+
    lowConfidenceThreshold: 0.5,   // Alert if below 50%
    highVarianceThreshold: 0.25,   // Alert if variance exceeds 25%
    checkIntervalMs: 60000,        // Check every minute
  },
});

// Record confidence scores
await tracker.record({
  entityId: 'agent-123',
  category: 'code-review',
  task: 'review-pr-456',
  confidence: 0.85,
  metadata: { language: 'typescript' },
});

// Get metrics
const metrics = await tracker.getMetrics('agent-123');
console.log(`Average confidence: ${metrics.averageConfidence}`);
console.log(`Trend: ${metrics.confidenceTrend}`);

// Listen for anomalies
tracker.on('anomaly', (alert) => {
  console.log(`Alert: ${alert.type} for ${alert.entityId}`);
  console.log(`Severity: ${alert.severity}`);
  console.log(`Current: ${alert.details.currentConfidence}`);
  console.log(`Historical: ${alert.details.historicalAverage}`);
});
```

## API

### `new ConfidenceTracker(config)`

Create a new tracker instance.

```typescript
interface ConfidenceTrackerConfig {
  /** Storage backend */
  store: ConfidenceStore;

  /** Anomaly detection configuration */
  anomalyDetection?: {
    enabled: boolean;
    suddenDropThreshold: number;     // 0-1
    lowConfidenceThreshold: number;  // 0-1
    highVarianceThreshold: number;   // 0-1
    checkIntervalMs: number;
    minDataPoints?: number;          // Default: 10
    alertCooldownMs?: number;        // Default: 5 minutes
  };

  /** Optional logger */
  logger?: Logger;
}
```

### `tracker.record(dataPoint)`

Record a confidence score.

```typescript
await tracker.record({
  entityId: 'agent-123',          // Required: Entity being tracked
  category: 'code-review',        // Required: Task category
  task: 'review-pr-456',          // Required: Specific task
  confidence: 0.85,               // Required: Score 0-1
  timestamp: new Date(),          // Optional: Defaults to now
  correlationId: 'exec-789',      // Optional: For linking data
  metadata: { custom: 'data' },   // Optional: Additional info
});
```

### `tracker.getMetrics(entityId, timeRange?)`

Get aggregated metrics for an entity.

```typescript
const metrics = await tracker.getMetrics('agent-123', {
  start: new Date(Date.now() - 24 * 60 * 60 * 1000),
  end: new Date(),
});

// Returns:
// {
//   entityId: 'agent-123',
//   averageConfidence: 0.85,
//   minConfidence: 0.6,
//   maxConfidence: 0.95,
//   confidenceTrend: 'improving',  // 'improving' | 'stable' | 'declining'
//   dataPoints: 150,
//   timeRange: { start: Date, end: Date },
// }
```

### `tracker.getHistoricalData(entityId, interval, startTime?, endTime?)`

Get time-bucketed historical data.

```typescript
const hourly = await tracker.getHistoricalData('agent-123', 'hour');

// Returns:
// [
//   { time: Date, avgConfidence: 0.82, count: 15 },
//   { time: Date, avgConfidence: 0.85, count: 18 },
//   ...
// ]
```

### `tracker.getActiveAlerts()`

Get all active anomaly alerts.

```typescript
const alerts = tracker.getActiveAlerts();

// Each alert:
// {
//   id: 'agent-123-sudden_drop-1234567890',
//   entityId: 'agent-123',
//   type: 'sudden_drop',  // 'sudden_drop' | 'consistently_low' | 'high_variance'
//   severity: 'high',     // 'low' | 'medium' | 'high'
//   detectedAt: Date,
//   details: {
//     currentConfidence: 0.4,
//     historicalAverage: 0.85,
//     deviation: 0.45,
//     dataPointsAnalyzed: 20,
//   },
// }
```

### `tracker.acknowledgeAlert(alertId)`

Acknowledge and dismiss an alert.

```typescript
tracker.acknowledgeAlert('agent-123-sudden_drop-1234567890');
```

### `tracker.getCategoryStats(category, startTime?, endTime?)`

Get statistics for a category across all entities.

```typescript
const stats = await tracker.getCategoryStats('code-review');

// Returns:
// {
//   avgConfidence: 0.82,
//   totalExecutions: 500,
//   successRate: 0.85,  // % with confidence > 0.7
//   entityBreakdown: Map { 'agent-1' => 250, 'agent-2' => 250 },
// }
```

### `tracker.shutdown()`

Gracefully shutdown the tracker.

```typescript
await tracker.shutdown();
```

## Events

```typescript
tracker.on('recorded', (dataPoint) => {
  console.log(`Recorded: ${dataPoint.entityId} = ${dataPoint.confidence}`);
});

tracker.on('anomaly', (alert) => {
  console.log(`Anomaly: ${alert.type} - ${alert.severity}`);
  // Send to alerting system
});

tracker.on('anomaly:resolved', ({ alertId, entityId }) => {
  console.log(`Alert resolved: ${alertId}`);
});
```

## Storage Backends

### InMemoryStore

Fast, suitable for development and testing.

```typescript
import { InMemoryStore } from '@parallax/confidence-tracker';

const store = new InMemoryStore({
  maxDataPoints: 10000,       // Per entity
  retentionPeriodDays: 7,     // Auto-cleanup
  pruneIntervalMs: 3600000,   // Cleanup every hour
});
```

### Custom Store

Implement the `ConfidenceStore` interface:

```typescript
import { ConfidenceStore } from '@parallax/confidence-tracker';

class MyStore implements ConfidenceStore {
  async addDataPoint(point) { /* ... */ }
  async getDataPoints(entityId, start, end) { /* ... */ }
  async getAggregatedData(entityId, interval, start, end) { /* ... */ }
  async getCategoryStats(category, start, end) { /* ... */ }
  async detectAnomalies(entityId, threshold) { /* ... */ }
  async cleanup(retentionDays) { /* ... */ }
  async clear() { /* ... */ }
}
```

## Use Cases

1. **AI Agent Monitoring** - Track confidence scores across agent tasks
2. **ML Model Drift Detection** - Monitor prediction confidence over time
3. **Quality Assurance** - Track test confidence and reliability
4. **SLO Monitoring** - Use confidence as a reliability metric
5. **A/B Testing** - Compare confidence between model versions

## Anomaly Types

| Type | Trigger | Severity Calculation |
|------|---------|---------------------|
| `sudden_drop` | Confidence drops > threshold below average | High if >50%, Medium if >30% |
| `consistently_low` | Recent average below threshold | Medium |
| `high_variance` | Standard deviation exceeds threshold | High if >30%, Medium if >20% |

## License

MIT
