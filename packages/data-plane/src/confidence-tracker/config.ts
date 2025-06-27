/**
 * Configuration for confidence tracking
 */

import { ConfidenceTrackerConfig } from './confidence-tracker';
import { InfluxDBStoreConfig } from './influxdb-store';

export function getConfidenceTrackerConfig(): ConfidenceTrackerConfig {
  const store = process.env.PARALLAX_CONFIDENCE_STORE || 'memory';
  
  const baseConfig: ConfidenceTrackerConfig = {
    maxDataPoints: parseInt(process.env.PARALLAX_MAX_DATA_POINTS || '100000'),
    retentionPeriodDays: parseInt(process.env.PARALLAX_RETENTION_DAYS || '7'),
    aggregationIntervals: {
      minute: 60,
      hour: 3600,
      day: 86400,
    },
    anomalyDetection: {
      enabled: process.env.PARALLAX_ANOMALY_DETECTION !== 'false',
      suddenDropThreshold: parseFloat(process.env.PARALLAX_SUDDEN_DROP_THRESHOLD || '0.3'),
      lowConfidenceThreshold: parseFloat(process.env.PARALLAX_LOW_CONFIDENCE_THRESHOLD || '0.5'),
      highVarianceThreshold: parseFloat(process.env.PARALLAX_HIGH_VARIANCE_THRESHOLD || '0.2'),
      checkIntervalMs: parseInt(process.env.PARALLAX_ANOMALY_CHECK_INTERVAL || '60000'),
    },
    store: store as 'memory' | 'influxdb',
  };
  
  // Add InfluxDB configuration if enabled
  if (store === 'influxdb') {
    const influxConfig: InfluxDBStoreConfig = {
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || '',
      org: process.env.INFLUXDB_ORG || 'parallax',
      bucket: process.env.INFLUXDB_BUCKET || 'metrics',
      retentionPeriodDays: parseInt(process.env.INFLUXDB_RETENTION_DAYS || '30'),
    };
    
    if (!influxConfig.token) {
      throw new Error('INFLUXDB_TOKEN is required when using InfluxDB store');
    }
    
    baseConfig.influxdb = influxConfig;
  }
  
  return baseConfig;
}