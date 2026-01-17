import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents metadata extracted from a primitive definition
 */
export interface PrimitiveMetadata {
  name: string;
  category: string;
  description: string;
  confidence: string;
  exports: string[];
  parameters?: Record<string, any>;
  variants?: string[];
}

/**
 * Represents a loaded primitive with its metadata and source
 */
export interface LoadedPrimitive {
  metadata: PrimitiveMetadata;
  filePath: string;
  source: string;
}

/**
 * Options for loading primitives
 */
export interface PrimitiveLoaderOptions {
  /**
   * Base path to the primitives directory
   * Defaults to @parallax/primitives package
   */
  basePath?: string;
  
  /**
   * Additional paths to search for custom primitives
   */
  customPaths?: string[];
  
  /**
   * Categories to include (if not specified, all categories are loaded)
   */
  includeCategories?: string[];
  
  /**
   * Categories to exclude
   */
  excludeCategories?: string[];
}

/**
 * Loads and parses primitive definitions from .prism files
 */
export class PrimitiveLoader {
  private primitives: Map<string, LoadedPrimitive> = new Map();
  private categories: Map<string, LoadedPrimitive[]> = new Map();
  private _loaded = false;
  
  constructor(private options: PrimitiveLoaderOptions = {}) {}
  
  /**
   * Load all primitives from the configured paths
   */
  async loadAll(): Promise<Map<string, LoadedPrimitive>> {
    const basePath = this.options.basePath || this.getDefaultPrimitivesPath();
    
    // Load from base path
    await this.loadFromPath(basePath);
    
    // Load from custom paths if provided
    if (this.options.customPaths) {
      for (const customPath of this.options.customPaths) {
        await this.loadFromPath(customPath);
      }
    }
    
    this._loaded = true;
    return this.primitives;
  }

  /**
   * Load primitives (for CLI)
   */
  async loadPrimitives(): Promise<void> {
    if (!this._loaded) {
      await this.loadAll();
    }
  }

  /**
   * List all primitive names
   */
  listPrimitives(): string[] {
    return Array.from(this.primitives.keys());
  }
  
  /**
   * Load primitives from a specific path
   */
  private async loadFromPath(basePath: string): Promise<void> {
    if (!fs.existsSync(basePath)) {
      throw new Error(`Primitives path does not exist: ${basePath}`);
    }
    
    // Get all categories (subdirectories)
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    const categories = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => !entry.name.startsWith('.') && 
                      entry.name !== 'node_modules' && 
                      entry.name !== 'examples' &&
                      entry.name !== 'test' &&
                      entry.name !== 'composition' &&
                      entry.name !== 'integration' &&
                      entry.name !== 'validation')
      .map(entry => entry.name);
    
    // Load primitives from each category
    for (const category of categories) {
      // Check if category should be included
      if (this.options.includeCategories && !this.options.includeCategories.includes(category)) {
        continue;
      }
      
      if (this.options.excludeCategories && this.options.excludeCategories.includes(category)) {
        continue;
      }
      
      const categoryPath = path.join(basePath, category);
      await this.loadCategory(categoryPath, category);
    }
  }
  
  /**
   * Load all primitives from a category directory
   */
  private async loadCategory(categoryPath: string, category: string): Promise<void> {
    const files = fs.readdirSync(categoryPath)
      .filter(file => file.endsWith('.prism'));
    
    for (const file of files) {
      const filePath = path.join(categoryPath, file);
      try {
        const primitive = await this.loadPrimitive(filePath, category);
        
        // Store by name
        this.primitives.set(primitive.metadata.name, primitive);
        
        // Store by category
        if (!this.categories.has(category)) {
          this.categories.set(category, []);
        }
        this.categories.get(category)!.push(primitive);
        
        // Also store variants if they exist
        if (primitive.metadata.variants) {
          for (const variant of primitive.metadata.variants) {
            const variantPrimitive = {
              ...primitive,
              metadata: {
                ...primitive.metadata,
                name: variant,
                isVariant: true,
                parentName: primitive.metadata.name
              }
            };
            this.primitives.set(variant, variantPrimitive);
          }
        }
      } catch (error) {
        console.error(`Failed to load primitive from ${filePath}:`, error);
      }
    }
  }
  
  /**
   * Load and parse a single primitive file
   */
  private async loadPrimitive(filePath: string, category: string): Promise<LoadedPrimitive> {
    const source = fs.readFileSync(filePath, 'utf-8');
    const metadata = this.extractMetadata(source, filePath, category);
    
    return {
      metadata,
      filePath,
      source
    };
  }
  
  /**
   * Extract metadata from primitive source code
   */
  private extractMetadata(source: string, filePath: string, category: string): PrimitiveMetadata {
    const lines = source.split('\n');
    const metadata: PrimitiveMetadata = {
      name: '',
      category: category,
      description: '',
      confidence: '',
      exports: [],
      variants: []
    };
    
    // Extract metadata from comments at the top
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('// Primitive:')) {
        metadata.name = trimmed.replace('// Primitive:', '').trim();
      } else if (trimmed.startsWith('// Category:')) {
        // Use the provided category, but verify it matches
        const declaredCategory = trimmed.replace('// Category:', '').trim();
        if (declaredCategory !== category) {
          console.warn(`Category mismatch in ${filePath}: declared '${declaredCategory}' but found in '${category}'`);
        }
      } else if (trimmed.startsWith('// Description:')) {
        metadata.description = trimmed.replace('// Description:', '').trim();
      } else if (trimmed.startsWith('// Confidence:')) {
        metadata.confidence = trimmed.replace('// Confidence:', '').trim();
      } else if (!trimmed.startsWith('//') && trimmed.length > 0) {
        // End of metadata comments
        break;
      }
    }
    
    // Extract exported functions
    const exportRegex = /export\s+const\s+(\w+)\s*=/g;
    let match;
    while ((match = exportRegex.exec(source)) !== null) {
      metadata.exports.push(match[1]);
      
      // Check if this is a variant (not the main primitive)
      if (match[1] !== metadata.name && match[1].startsWith(metadata.name)) {
        metadata.variants?.push(match[1]);
      }
    }
    
    // Extract parameters from the main function
    const mainFunctionRegex = new RegExp(`export\\s+const\\s+${metadata.name}\\s*=\\s*\\(([^)]*?)\\)`, 's');
    const functionMatch = source.match(mainFunctionRegex);
    if (functionMatch && functionMatch[1]) {
      const params = functionMatch[1].split(',').map(p => p.trim()).filter(p => p);
      if (params.length > 0) {
        metadata.parameters = {};
        params.forEach((param, index) => {
          // Extract parameter name (handle default values and destructuring)
          const paramName = param.split('=')[0].trim().replace(/[{}]/g, '');
          metadata.parameters![paramName] = {
            index,
            hasDefault: param.includes('=')
          };
        });
      }
    }
    
    // Fallback: if name wasn't found in comments, use filename
    if (!metadata.name) {
      metadata.name = path.basename(filePath, '.prism');
    }
    
    return metadata;
  }
  
  /**
   * Get the default path to the primitives package
   */
  private getDefaultPrimitivesPath(): string {
    try {
      // Try to resolve the @parallax/primitives package
      const primitivesPackage = require.resolve('@parallax/primitives/package.json');
      return path.dirname(primitivesPackage);
    } catch {
      // Fallback to relative path
      return path.resolve(__dirname, '../../../primitives');
    }
  }
  
  /**
   * Get all loaded primitives
   */
  getPrimitives(): Map<string, LoadedPrimitive> {
    return this.primitives;
  }
  
  /**
   * Get primitives by category
   */
  getPrimitivesByCategory(category: string): LoadedPrimitive[] {
    return this.categories.get(category) || [];
  }
  
  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }
  
  /**
   * Get a specific primitive by name
   */
  getPrimitive(name: string): LoadedPrimitive | undefined {
    return this.primitives.get(name);
  }
  
  /**
   * Check if a primitive exists
   */
  hasPrimitive(name: string): boolean {
    return this.primitives.has(name);
  }
  
  /**
   * Get primitive metadata without the full source
   */
  getPrimitiveMetadata(name: string): PrimitiveMetadata | undefined {
    const primitive = this.primitives.get(name);
    return primitive?.metadata;
  }
  
  /**
   * Search primitives by description or name
   */
  searchPrimitives(query: string): LoadedPrimitive[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.primitives.values()).filter(primitive => 
      primitive.metadata.name.toLowerCase().includes(lowerQuery) ||
      primitive.metadata.description.toLowerCase().includes(lowerQuery)
    );
  }
  
  /**
   * Get primitives that match a confidence strategy
   */
  getPrimitivesByConfidence(confidenceStrategy: string): LoadedPrimitive[] {
    return Array.from(this.primitives.values()).filter(primitive =>
      primitive.metadata.confidence === confidenceStrategy
    );
  }
  
  /**
   * Generate a summary of all loaded primitives
   */
  generateSummary(): Record<string, { count: number; primitives: string[] }> {
    const summary: Record<string, { count: number; primitives: string[] }> = {};
    
    for (const [category, primitives] of this.categories) {
      summary[category] = {
        count: primitives.length,
        primitives: primitives.map(p => p.metadata.name)
      };
    }
    
    return summary;
  }
}

/**
 * Convenience function to create and load primitives
 */
export async function loadPrimitives(options?: PrimitiveLoaderOptions): Promise<Map<string, LoadedPrimitive>> {
  const loader = new PrimitiveLoader(options);
  return await loader.loadAll();
}

/**
 * Synchronous primitive loader (loads from default path)
 * Used by PatternGenerator
 */
export function loadPrimitivesSync(_primitivesPath?: string): Map<string, any> {
  // For now, return a mock map - in production, this would load real primitives
  const mockPrimitives = new Map();
  
  const categories = ['execution', 'aggregation', 'confidence', 'control'];
  const primitivesByCategory: Record<string, string[]> = {
    execution: ['parallel', 'sequential', 'race', 'batch'],
    aggregation: ['consensus', 'voting', 'merge', 'reduce'],
    confidence: ['threshold', 'transform'],
    control: ['retry', 'fallback', 'circuit', 'timeout', 'escalate']
  };
  
  categories.forEach(category => {
    primitivesByCategory[category].forEach(name => {
      mockPrimitives.set(name, {
        name,
        category,
        description: `${name} primitive for ${category}`,
        parameters: [],
        examples: []
      });
    });
  });
  
  return mockPrimitives;
}


