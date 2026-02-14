/**
 * @parallax/confidence-tracker
 *
 * Statistical confidence tracking with anomaly detection for AI agents and ML systems.
 *
 * @example
 * ```typescript
 * import { ConfidenceTracker, InMemoryStore } from '@parallax/confidence-tracker';
 *
 * const tracker = new ConfidenceTracker({
 *   store: new InMemoryStore({ maxDataPoints: 10000 }),
 *   anomalyDetection: {
 *     enabled: true,
 *     suddenDropThreshold: 0.3,
 *     lowConfidenceThreshold: 0.5,
 *     highVarianceThreshold: 0.25,
 *     checkIntervalMs: 60000,
 *   },
 * });
 *
 * // Record confidence scores
 * await tracker.record({
 *   entityId: 'agent-123',
 *   category: 'code-review',
 *   task: 'review-pr-456',
 *   confidence: 0.85,
 * });
 *
 * // Get metrics
 * const metrics = await tracker.getMetrics('agent-123');
 *
 * // Listen for anomalies
 * tracker.on('anomaly', (alert) => {
 *   console.log('Alert:', alert.type, alert.severity);
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main tracker
export { ConfidenceTracker } from './confidence-tracker';

// Storage backends
export { InMemoryStore } from './stores/memory.store';
export type { InMemoryStoreConfig } from './stores/memory.store';

// Types
export type {
  ConfidenceDataPoint,
  ConfidenceMetrics,
  ConfidenceQuery,
  ConfidenceAnomalyAlert,
  AggregationInterval,
  AggregatedDataPoint,
  ConfidenceStore,
  AnomalyDetectionConfig,
  ConfidenceTrackerConfig,
  ConfidenceTrackerEvents,
  Logger,
} from './types';
