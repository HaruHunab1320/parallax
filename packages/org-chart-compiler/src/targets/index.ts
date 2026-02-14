/**
 * Target Exports
 */

export { prismTarget } from './prism.target';
export { jsonTarget, buildJsonPlan } from './json.target';
export { mermaidTarget } from './mermaid.target';

import type { CompileTarget } from '../types';
import { prismTarget } from './prism.target';
import { jsonTarget } from './json.target';
import { mermaidTarget } from './mermaid.target';

/**
 * Built-in target registry
 */
export const builtInTargets: Record<string, CompileTarget> = {
  prism: prismTarget,
  json: jsonTarget,
  mermaid: mermaidTarget,
};

/**
 * Get a built-in target by name
 */
export function getTarget(name: string): CompileTarget | undefined {
  return builtInTargets[name];
}

/**
 * List available target names
 */
export function listTargets(): string[] {
  return Object.keys(builtInTargets);
}
