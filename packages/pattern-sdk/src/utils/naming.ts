/**
 * Naming utilities for patterns
 */

/**
 * Format pattern name from goal description
 */
export function formatPatternName(goal: string, style: 'kebab-case' | 'camelCase' | 'snake_case' = 'kebab-case'): string {
  // Clean the goal string
  const cleaned = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
  
  // Split into words
  const words = cleaned.split(' ').filter(word => word.length > 0);
  
  // Format based on style
  switch (style) {
    case 'kebab-case':
      return words.join('-');
      
    case 'camelCase':
      return words
        .map((word, index) => 
          index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join('');
      
    case 'snake_case':
      return words.join('_');
      
    default:
      return words.join('-');
  }
}