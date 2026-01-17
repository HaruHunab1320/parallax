/**
 * Load requirements from file
 */

import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { OrchestrationRequirements, OrchestrationRequirementsSchema } from '../types';

/**
 * Load orchestration requirements from file
 */
export async function loadRequirements(filePath: string): Promise<OrchestrationRequirements> {
  // Check if file exists
  if (!await fs.pathExists(filePath)) {
    throw new Error(`Requirements file not found: ${filePath}`);
  }
  
  // Read file content
  const content = await fs.readFile(filePath, 'utf8');
  
  // Determine format by extension
  const ext = path.extname(filePath).toLowerCase();
  let data: any;
  
  switch (ext) {
    case '.yaml':
    case '.yml':
      data = yaml.load(content);
      break;
      
    case '.json':
      data = JSON.parse(content);
      break;
      
    default:
      // Try to parse as YAML first, then JSON
      try {
        data = yaml.load(content);
      } catch {
        try {
          data = JSON.parse(content);
        } catch {
          throw new Error(`Unable to parse requirements file: ${filePath}`);
        }
      }
  }
  
  // Extract requirements
  let requirements: any;
  
  // Support different file structures
  if (data.requirements) {
    // File has a 'requirements' section
    requirements = data.requirements;
  } else if (data.goal) {
    // File is the requirements object directly
    requirements = data;
  } else {
    throw new Error('Invalid requirements file format: missing "goal" or "requirements" field');
  }
  
  // Validate requirements
  try {
    return OrchestrationRequirementsSchema.parse(requirements);
  } catch (error) {
    throw new Error(`Invalid requirements: ${error}`);
  }
}