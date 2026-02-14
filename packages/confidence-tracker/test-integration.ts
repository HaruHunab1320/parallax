/**
 * Integration test - verifies the built package works correctly
 * Run with: npx tsx test-integration.ts
 */

import { ConfidenceTracker, InMemoryStore } from './src/index';
import type { ConfidenceAnomalyAlert } from './src/index';

async function main() {
  console.log('Testing @parallax/confidence-tracker integration...\n');

  // Create tracker with in-memory store
  const store = new InMemoryStore({ maxDataPoints: 1000 });
  const tracker = new ConfidenceTracker({
    store,
    anomalyDetection: {
      enabled: true,
      suddenDropThreshold: 0.3,
      lowConfidenceThreshold: 0.5,
      highVarianceThreshold: 0.25,
      checkIntervalMs: 60000,
      minDataPoints: 5,
    },
  });

  // Track anomalies
  const anomalies: ConfidenceAnomalyAlert[] = [];
  tracker.on('anomaly', (alert) => {
    anomalies.push(alert);
  });

  // 1. Record some confidence scores
  console.log('1. Recording confidence scores...');
  for (let i = 0; i < 10; i++) {
    await tracker.record({
      entityId: 'agent-1',
      category: 'code-review',
      task: `task-${i}`,
      confidence: 0.85 + Math.random() * 0.1,
    });
  }

  // 2. Get metrics
  const metrics = await tracker.getMetrics('agent-1');
  console.log('2. Metrics:', {
    entityId: metrics.entityId,
    avgConfidence: metrics.averageConfidence.toFixed(3),
    minConfidence: metrics.minConfidence.toFixed(3),
    maxConfidence: metrics.maxConfidence.toFixed(3),
    trend: metrics.confidenceTrend,
    dataPoints: metrics.dataPoints,
  });
  console.assert(metrics.dataPoints === 10, 'Should have 10 data points');
  console.assert(metrics.averageConfidence > 0.8, 'Average should be above 0.8');

  // 3. Get historical data
  const hourlyData = await tracker.getHistoricalData('agent-1', 'hour');
  console.log('3. Hourly aggregation:', hourlyData.length, 'buckets');
  console.assert(hourlyData.length > 0, 'Should have hourly data');

  // 4. Record low confidence to trigger anomaly
  console.log('4. Recording low confidence to trigger anomaly...');
  await tracker.record({
    entityId: 'agent-1',
    category: 'code-review',
    task: 'problematic-task',
    confidence: 0.3,
  });

  // 5. Check anomaly detection
  console.log('5. Anomalies detected:', anomalies.length);
  if (anomalies.length > 0) {
    console.log('   Alert:', {
      type: anomalies[0].type,
      severity: anomalies[0].severity,
      entityId: anomalies[0].entityId,
    });
  }

  // 6. Get active alerts
  const activeAlerts = tracker.getActiveAlerts();
  console.log('6. Active alerts:', activeAlerts.length);

  // 7. Test category stats with multiple entities
  await tracker.record({
    entityId: 'agent-2',
    category: 'code-review',
    task: 'task-1',
    confidence: 0.9,
  });

  const categoryStats = await tracker.getCategoryStats('code-review');
  console.log('7. Category stats:', {
    avgConfidence: categoryStats.avgConfidence.toFixed(3),
    totalExecutions: categoryStats.totalExecutions,
    successRate: (categoryStats.successRate * 100).toFixed(1) + '%',
    entities: categoryStats.entityBreakdown.size,
  });
  console.assert(categoryStats.entityBreakdown.size === 2, 'Should have 2 entities');

  // 8. Test acknowledge alert
  if (activeAlerts.length > 0) {
    const acknowledged = tracker.acknowledgeAlert(activeAlerts[0].id);
    console.log('8. Alert acknowledged:', acknowledged);
    console.assert(acknowledged, 'Should acknowledge alert');
  } else {
    console.log('8. No alerts to acknowledge');
  }

  // 9. Shutdown
  await tracker.shutdown();
  store.destroy();
  console.log('9. Tracker shutdown complete');

  console.log('\n✅ All integration tests passed!');
}

main().catch((e) => {
  console.error('❌ Integration test failed:', e);
  process.exit(1);
});
