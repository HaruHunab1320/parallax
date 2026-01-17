import { PrimitiveLoader, loadPrimitives } from './primitive-loader';
import * as path from 'path';

/**
 * Example usage of the PrimitiveLoader
 */
async function demonstratePrimitiveLoader() {
  console.log('=== Primitive Loader Demo ===\n');
  
  // Create a loader with default options
  const loader = new PrimitiveLoader();
  
  try {
    // Load all primitives
    console.log('Loading all primitives...');
    const primitives = await loader.loadAll();
    console.log(`Loaded ${primitives.size} primitives\n`);
    
    // Show summary by category
    const summary = loader.generateSummary();
    console.log('Primitives by category:');
    for (const [category, info] of Object.entries(summary)) {
      console.log(`  ${category}: ${info.count} primitives`);
      console.log(`    - ${info.primitives.join(', ')}`);
    }
    console.log('');
    
    // Get a specific primitive
    const parallelPrimitive = loader.getPrimitive('parallel');
    if (parallelPrimitive) {
      console.log('Parallel primitive metadata:');
      console.log(`  Name: ${parallelPrimitive.metadata.name}`);
      console.log(`  Category: ${parallelPrimitive.metadata.category}`);
      console.log(`  Description: ${parallelPrimitive.metadata.description}`);
      console.log(`  Confidence: ${parallelPrimitive.metadata.confidence}`);
      console.log(`  Exports: ${parallelPrimitive.metadata.exports.join(', ')}`);
      console.log(`  Variants: ${parallelPrimitive.metadata.variants?.join(', ') || 'none'}`);
      console.log('');
    }
    
    // Search for primitives
    console.log('Searching for "consensus" primitives:');
    const consensusPrimitives = loader.searchPrimitives('consensus');
    for (const primitive of consensusPrimitives) {
      console.log(`  - ${primitive.metadata.name}: ${primitive.metadata.description}`);
    }
    console.log('');
    
    // Get primitives by confidence strategy
    console.log('Primitives with "propagates-minimum" confidence:');
    const minConfidencePrimitives = loader.getPrimitivesByConfidence('propagates-minimum');
    for (const primitive of minConfidencePrimitives) {
      console.log(`  - ${primitive.metadata.name}`);
    }
    console.log('');
    
  } catch (error) {
    console.error('Error loading primitives:', error);
  }
}

/**
 * Example with custom options
 */
async function demonstrateCustomOptions() {
  console.log('\n=== Custom Options Demo ===\n');
  
  // Load only specific categories
  const loader = new PrimitiveLoader({
    includeCategories: ['execution', 'aggregation', 'control']
  });
  
  const primitives = await loader.loadAll();
  console.log(`Loaded ${primitives.size} primitives from selected categories`);
  console.log('Categories:', loader.getCategories().join(', '));
}

/**
 * Example using the convenience function
 */
async function demonstrateConvenienceFunction() {
  console.log('\n=== Convenience Function Demo ===\n');
  
  // Quick load with options
  const primitives = await loadPrimitives({
    excludeCategories: ['event', 'temporal']
  });
  
  console.log(`Loaded ${primitives.size} primitives`);
  
  // Show first 5 primitives
  console.log('\nFirst 5 primitives:');
  let count = 0;
  for (const [name, primitive] of primitives) {
    console.log(`  ${name}: ${primitive.metadata.description}`);
    if (++count >= 5) break;
  }
}

// Run demos if this file is executed directly
if (require.main === module) {
  (async () => {
    await demonstratePrimitiveLoader();
    await demonstrateCustomOptions();
    await demonstrateConvenienceFunction();
  })();
}