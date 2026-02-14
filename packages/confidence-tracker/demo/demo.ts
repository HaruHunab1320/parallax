/**
 * Confidence Tracker Demo
 *
 * Demonstrates tracking confidence across multiple agent responses.
 * Run with: npx tsx demo/demo.ts
 */

import { ConfidenceTracker, InMemoryStore } from '../src';

async function main() {
  console.log('=== Confidence Tracker Demo ===\n');

  // Create tracker with in-memory store
  const tracker = new ConfidenceTracker({
    store: new InMemoryStore({ maxDataPoints: 1000 }),
    anomalyDetection: {
      enabled: true,
      suddenDropThreshold: 0.3,
      lowConfidenceThreshold: 0.5,
      highVarianceThreshold: 0.25,
    },
  });

  // Listen for anomalies
  tracker.on('anomaly', (alert) => {
    console.log(`\n[ANOMALY DETECTED!]`);
    console.log(`  Type: ${alert.type}`);
    console.log(`  Severity: ${alert.severity}`);
    console.log(`  Entity: ${alert.entityId}`);
    console.log(`  Current Value: ${(alert.currentValue * 100).toFixed(0)}%`);
    console.log(`  Threshold: ${(alert.threshold * 100).toFixed(0)}%`);
    console.log();
  });

  // Listen for recorded events
  tracker.on('recorded', (point) => {
    // Silent - we'll print manually
  });

  // Simulate agent responses for a code review task
  const agentResponses = [
    { agentId: 'reviewer-1', category: 'code-review', task: 'pr-123', confidence: 0.85 },
    { agentId: 'reviewer-2', category: 'code-review', task: 'pr-123', confidence: 0.72 },
    { agentId: 'reviewer-3', category: 'code-review', task: 'pr-123', confidence: 0.91 },
    { agentId: 'security-scanner', category: 'security', task: 'pr-123', confidence: 0.95 },
    { agentId: 'reviewer-1', category: 'code-review', task: 'pr-124', confidence: 0.88 },
    { agentId: 'reviewer-1', category: 'code-review', task: 'pr-125', confidence: 0.82 },
    { agentId: 'reviewer-2', category: 'code-review', task: 'pr-125', confidence: 0.68 },
  ];

  console.log('Recording agent confidence scores:\n');

  for (const { agentId, category, task, confidence } of agentResponses) {
    await tracker.record({
      entityId: agentId,
      category,
      task,
      confidence,
    });

    console.log(`  ${agentId}: ${(confidence * 100).toFixed(0)}% (${task})`);
  }

  // Get metrics for each agent
  console.log('\n--- Agent Metrics (Last 24h) ---\n');

  for (const agentId of ['reviewer-1', 'reviewer-2', 'reviewer-3', 'security-scanner']) {
    const metrics = await tracker.getMetrics(agentId);
    if (metrics.dataPoints > 0) {
      console.log(`${agentId}:`);
      console.log(`  Data Points: ${metrics.dataPoints}`);
      console.log(`  Average: ${(metrics.averageConfidence * 100).toFixed(1)}%`);
      console.log(`  Range: ${(metrics.minConfidence * 100).toFixed(0)}% - ${(metrics.maxConfidence * 100).toFixed(0)}%`);
      console.log(`  Trend: ${metrics.confidenceTrend}`);
      console.log();
    }
  }

  // Simulate a low confidence response (should trigger anomaly)
  console.log('--- Recording Low Confidence Response ---\n');

  await tracker.record({
    entityId: 'reviewer-2',
    category: 'code-review',
    task: 'pr-126',
    confidence: 0.35, // Very low - should trigger anomaly
  });

  console.log('Recorded reviewer-2 with 35% confidence (below threshold)');

  // Check active alerts
  const alerts = tracker.getActiveAlerts();
  if (alerts.length > 0) {
    console.log(`\n--- Active Alerts: ${alerts.length} ---\n`);
    for (const alert of alerts) {
      console.log(`Alert: ${alert.type} for ${alert.entityId}`);
      console.log(`  Value: ${(alert.currentValue * 100).toFixed(0)}%`);
      console.log(`  Severity: ${alert.severity}`);
    }
  }

  // Final metrics for reviewer-2
  console.log('\n--- Final Metrics for reviewer-2 ---\n');
  const finalMetrics = await tracker.getMetrics('reviewer-2');
  console.log(`  Data Points: ${finalMetrics.dataPoints}`);
  console.log(`  Average: ${(finalMetrics.averageConfidence * 100).toFixed(1)}%`);
  console.log(`  Range: ${(finalMetrics.minConfidence * 100).toFixed(0)}% - ${(finalMetrics.maxConfidence * 100).toFixed(0)}%`);

  // Cleanup
  await tracker.shutdown();

  console.log('\n=== Demo Complete ===');
  console.log('Successfully tracked confidence scores and detected anomalies.\n');
}

main().catch(console.error);
