/**
 * Adapter Registry
 *
 * Registry for managing CLI adapters.
 */

import type { CLIAdapter } from './adapter-interface';

/**
 * Registry of available CLI adapters
 */
export class AdapterRegistry {
  private adapters: Map<string, CLIAdapter> = new Map();

  /**
   * Register an adapter
   */
  register(adapter: CLIAdapter): void {
    this.adapters.set(adapter.adapterType, adapter);
  }

  /**
   * Get adapter for type
   */
  get(adapterType: string): CLIAdapter | undefined {
    return this.adapters.get(adapterType);
  }

  /**
   * Check if adapter exists for type
   */
  has(adapterType: string): boolean {
    return this.adapters.has(adapterType);
  }

  /**
   * Unregister an adapter
   */
  unregister(adapterType: string): boolean {
    return this.adapters.delete(adapterType);
  }

  /**
   * List all registered adapter types
   */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get all adapters
   */
  all(): CLIAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Clear all adapters
   */
  clear(): void {
    this.adapters.clear();
  }
}
