# SDK Test Specification

All SDKs must implement and test the exact same functionality to ensure consistency across languages.

## Required Test Cases

### 1. Agent Creation Test
**Input**: Create agent with ID "test-agent-{lang}", capabilities ["analysis", "validation"]
**Expected Output**: Agent created with correct ID, name, and capabilities

### 2. Simple Analysis Test
**Input**: 
```json
{
  "task": "analyze",
  "data": {
    "content": "Test data for analysis",
    "type": "text"
  }
}
```
**Expected Output**: Response with confidence >= 0.7 and non-empty result

### 3. Validation Test
**Input**:
```json
{
  "task": "validate", 
  "data": {
    "value": 42,
    "rules": ["positive", "even"]
  }
}
```
**Expected Output**: 
```json
{
  "valid": true,
  "confidence": 0.95,
  "details": ["Value is positive", "Value is even"]
}
```

### 4. Error Handling Test
**Input**: Invalid task "unknown-task"
**Expected Output**: Error with message containing "unknown task" or "not supported"

### 5. Client API Tests (if control plane running)

#### 5.1 Health Check
**Endpoint**: GET /health
**Expected**: 200 OK with "healthy" status

#### 5.2 List Patterns
**Endpoint**: GET /api/patterns
**Expected**: Array with length > 0

#### 5.3 Pattern Execution
**Input**:
```json
{
  "patternName": "SimpleConsensus",
  "input": {
    "task": "SDK test",
    "data": {"test": true}
  }
}
```
**Expected**: Execution ID returned, status "accepted"

## Standardized Test Output Format

Each SDK should output results in this format:

```
=== Parallax SDK Test Results ===
Language: [TypeScript/Python/Go/Rust]
SDK Version: X.Y.Z

Test 1: Agent Creation............... [PASS/FAIL]
Test 2: Simple Analysis.............. [PASS/FAIL]
Test 3: Validation................... [PASS/FAIL]
Test 4: Error Handling............... [PASS/FAIL]
Test 5: Client API (optional)........ [PASS/FAIL/SKIP]

Summary: X/5 tests passed
```

## Why Standardization Matters

1. **Verification**: Ensures all SDKs provide the same functionality
2. **Debugging**: Easy to spot which SDK has issues
3. **Documentation**: Clear expectations for SDK implementers
4. **Integration**: Guarantees SDKs work identically with control plane
5. **Testing**: Can automate verification across all languages