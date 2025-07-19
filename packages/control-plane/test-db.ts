#!/usr/bin/env tsx
/**
 * Test script for database functionality
 */

import pino from 'pino';
import { DatabaseService } from './src/db/database.service';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

async function testDatabase() {
  const db = new DatabaseService(logger);
  
  try {
    // Initialize database
    await db.initialize();
    logger.info('Database initialized successfully');
    
    // Test pattern operations
    const pattern = await db.patterns.create({
      name: `test-pattern-${Date.now()}`,
      description: 'Test pattern for database',
      script: 'pattern test-pattern { }',
      version: '1.0.0',
    });
    logger.info({ pattern }, 'Created pattern');
    
    // Test agent operations
    const agent = await db.agents.create({
      name: `test-agent-${Date.now()}`,
      endpoint: 'http://localhost:8080',
      capabilities: ['test', 'demo'],
      metadata: { test: true, type: 'local' },
    });
    logger.info({ agent }, 'Created agent');
    
    // Test execution operations
    const execution = await db.executions.create({
      pattern: {
        connect: { id: pattern.id }
      },
      input: { test: 'data' },
      status: 'running',
    });
    logger.info({ execution }, 'Created execution');
    
    // Add event
    const event = await db.executions.addEvent(execution.id, {
      type: 'started',
      data: { message: 'Test execution started' },
    });
    logger.info({ event }, 'Added event');
    
    // Update execution
    await db.executions.updateStatus(execution.id, 'completed', {
      result: { success: true },
      durationMs: 1000,
      confidence: 0.95,
    });
    logger.info('Updated execution status');
    
    // Get stats
    const stats = await db.executions.getStats();
    logger.info({ stats }, 'Execution stats');
    
    // List patterns
    const patterns = await db.patterns.findAll();
    logger.info({ count: patterns.length }, 'Listed patterns');
    
    // Cleanup
    await db.executions.delete(execution.id);
    await db.agents.delete(agent.id);
    await db.patterns.delete(pattern.id);
    logger.info('Cleaned up test data');
    
  } catch (error) {
    logger.error({ error }, 'Database test failed');
  } finally {
    await db.disconnect();
  }
}

// Run the test
testDatabase()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });