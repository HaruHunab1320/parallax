# Pattern SDK Battle Test Report

Generated: 2025-07-27T04:04:25.016Z

## Summary

- **Total Tests**: 5
- **Success Rate**: 40% (2/5)
- **Valid Syntax Rate**: 60%
- **Proper Confidence Flow Rate**: 100%
- **Average Complexity**: 4.60

## Results by Category

| Category | Total | Success | Failed | Success Rate |
|----------|-------|---------|--------|-------------|
| simple | 1 | 0 | 1 | 0% |
| consensus | 1 | 0 | 1 | 0% |
| error-handling | 1 | 1 | 0 | 100% |
| complex | 1 | 0 | 1 | 0% |
| edge-cases | 1 | 1 | 0 | 100% |

## Common Issues

1. **Validation error: Cannot apply / to type any** (2 occurrences)
2. **Parallel primitive used but no agent mapping found** (1 occurrences)

## Successful Patterns

- **Fallback pattern** (error-2)
  - Category: error-handling
  - Complexity: 4.5
  - Primitives: sequential, threshold, fallback

- **No agents specified** (edge-1)
  - Category: edge-cases
  - Complexity: 2.5
  - Primitives: sequential, threshold

## Failed Patterns

- **Basic parallel execution** (simple-1)
  - Category: simple
  - Error: No error message
  - Issues: Validation error: Cannot apply / to type any

- **Simple consensus** (consensus-1)
  - Category: consensus
  - Error: No error message
  - Issues: Validation error: Cannot apply / to type any

- **Multi-stage pipeline with consensus** (complex-1)
  - Category: complex
  - Error: No error message
  - Issues: Parallel primitive used but no agent mapping found

## Recommendations

1. Enhance Prism syntax generation to reduce validation errors
2. Improve handling of simple patterns (0% success rate)
3. Improve handling of consensus patterns (0% success rate)
4. Improve handling of complex patterns (0% success rate)
