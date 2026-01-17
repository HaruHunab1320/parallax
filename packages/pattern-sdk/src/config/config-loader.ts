/**
 * Configuration loader for Pattern SDK
 */

import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';
import { PatternConfig } from '../types';

/**
 * Load pattern configuration
 */
export async function loadConfig(configPath?: string): Promise<PatternConfig> {
  // Default config
  const defaultConfig: PatternConfig = {
    version: '1.0',
    generation: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7
    },
    patterns: {
      outputDir: './patterns',
      naming: 'kebab-case'
    }
  };
  
  // Look for config file
  const possiblePaths = [
    configPath,
    './parallax.config.yml',
    './parallax.config.yaml',
    './parallax.config.json',
    './.parallax.yml',
    './.parallax.yaml',
    './.parallax.json'
  ].filter(Boolean) as string[];
  
  for (const path of possiblePaths) {
    if (await fs.pathExists(path)) {
      try {
        const content = await fs.readFile(path, 'utf8');
        const ext = path.split('.').pop()?.toLowerCase();
        
        let userConfig: any;
        if (ext === 'json') {
          userConfig = JSON.parse(content);
        } else {
          userConfig = yaml.load(content);
        }
        
        // Merge with defaults
        return mergeConfig(defaultConfig, userConfig);
      } catch (error) {
        console.warn(`Failed to load config from ${path}:`, error);
      }
    }
  }
  
  // Return default config if no file found
  return defaultConfig;
}

/**
 * Save configuration
 */
export async function saveConfig(config: PatternConfig, filePath: string = './parallax.config.yml') {
  const content = yaml.dump(config, {
    indent: 2,
    lineWidth: 80,
    noRefs: true
  });
  
  await fs.writeFile(filePath, content, 'utf8');
}

/**
 * Merge configurations
 */
function mergeConfig(defaultConfig: PatternConfig, userConfig: any): PatternConfig {
  return {
    version: userConfig.version || defaultConfig.version,
    generation: {
      ...defaultConfig.generation,
      ...userConfig.generation
    },
    patterns: {
      ...defaultConfig.patterns,
      ...userConfig.patterns
    },
    templates: {
      ...defaultConfig.templates,
      ...userConfig.templates
    }
  };
}

// Re-export type
export type { PatternConfig };