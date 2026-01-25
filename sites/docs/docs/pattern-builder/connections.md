---
sidebar_position: 3
title: Connections
---

# Connections

Connections define how data flows between nodes in the Pattern Builder.

## Creating Connections

### Drag to Connect

1. Hover over a node's output handle (right side)
2. Click and drag to another node's input handle (left side)
3. Release to create the connection

### Connection Line

The connection line shows:
- **Animated dots**: Data flow direction
- **Line color**: Connection type
- **Curve**: Automatic routing around nodes

## Connection Types

### Data Connection

Passes data from one node to the next.

```
┌─────────┐          ┌─────────┐
│  Agent  │─────────▶│  Vote   │
└─────────┘  data    └─────────┘
```

- **Color**: Blue
- **Animation**: Flowing dots
- **Purpose**: Transfer results between nodes

### Trigger Connection

Signals execution order without data transfer.

```
┌─────────┐          ┌─────────┐
│ Step 1  │─ ─ ─ ─ ─▶│ Step 2  │
└─────────┘ trigger  └─────────┘
```

- **Color**: Gray
- **Animation**: None (dashed line)
- **Purpose**: Define execution sequence

### Error Connection

Routes errors to error handlers.

```
┌─────────┐          ┌─────────┐
│  Agent  │────X────▶│ Fallback│
└─────────┘  error   └─────────┘
```

- **Color**: Red
- **Animation**: None
- **Purpose**: Error handling

## Connection Rules

### Valid Connections

| From | To | Valid |
|------|-----|-------|
| Input | Agent | Yes |
| Agent | Vote/Consensus/Merge | Yes |
| Agent | Agent (sequential) | Yes |
| Vote | Output | Yes |
| Consensus | Output | Yes |
| Merge | Output | Yes |
| Any | Quality Gate | Yes |
| Quality Gate | Output | Yes |

### Invalid Connections

| From | To | Reason |
|------|-----|--------|
| Output | Any | Output is terminal |
| Any | Input | Input is entry point |
| Node → Same Node | Self-reference | Creates cycle |

### Type Compatibility

Connections validate data types:

```
String Output ────▶ String Input    ✓ Compatible
Number Output ────▶ Number Input    ✓ Compatible
String Output ────▶ Number Input    ✗ Type mismatch
Array Output  ────▶ Object Input    ✗ Type mismatch
Any Output    ────▶ Any Input       ✓ Universal type
```

## Managing Connections

### Select Connection

- Click on the connection line
- Selected connections show handles

### Delete Connection

- Select and press `Delete` or `Backspace`
- Or right-click and select "Delete"

### Reroute Connection

- Delete existing connection
- Create new connection to different target

## Connection Handles

### Output Handles

Located on the right side of nodes:

```
┌─────────────────────┐
│                     │
│      Node       (●) │ ← Output handle
│                     │
└─────────────────────┘
```

### Input Handles

Located on the left side of nodes:

```
┌─────────────────────┐
│                     │
│ (●)    Node         │
│                     │
└─────────────────────┘
  ↑
Input handle
```

### Multiple Handles

Some nodes have multiple connection points:

```
┌─────────────────────┐
│     Switch Node     │
├─────────────────────┤
│ case: document  (●) │ ← Route to document handler
│ case: image     (●) │ ← Route to image handler
│ default         (●) │ ← Default route
└─────────────────────┘
```

## Data Flow Patterns

### Linear Flow

Simple sequential processing:

```
Input → Agent → Vote → Output
```

### Parallel Flow

Multiple paths merge:

```
         ┌─ Agent 1 ─┐
Input ───┤           ├─── Merge → Output
         └─ Agent 2 ─┘
```

### Branching Flow

Conditional routing:

```
                ┌─ Handler A → Output A
Input → Switch ─┤
                └─ Handler B → Output B
```

### Loop Flow

Iterative processing:

```
Input → Process → Quality Gate ─┐
            ↑                   │ (retry)
            └───────────────────┘
```

## Variable References

Connections implicitly create variable references.

### Automatic Variables

When you connect nodes, variables are created:

```
Agent → Vote
```

Creates:
- `$results` - Agent results
- `$vote.result` - Voting winner
- `$vote.confidence` - Voting confidence

### Referencing in Output

The Output node uses these variables:

```
Output Mappings:
  result → $vote.result
  confidence → $vote.confidence
```

### Variable Scope

Variables are scoped to their creation point:

```
Step 1: $step1.result
Step 2: $step2.result (can access $step1.result)
Step 3: $step3.result (can access $step1 and $step2)
```

## Connection Validation

### Error Indicators

- **Red connection**: Invalid or broken
- **Orange connection**: Warning (may work but not recommended)
- **Blue connection**: Valid

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Missing target" | Connection end not attached | Connect to valid input |
| "Type mismatch" | Incompatible data types | Use compatible types |
| "Cycle detected" | Circular reference | Break the cycle |
| "Missing dependency" | Required input not connected | Add missing connection |

### Validation Messages

Hover over a problematic connection to see details:

```
⚠️ Warning: Connection from Agent to Output skips aggregation.
   Consider adding a Vote or Consensus node.
```

## Best Practices

### Keep Flows Clear

- Avoid crossing connections when possible
- Use consistent left-to-right flow
- Group related nodes together

### Validate Connections

- Check for red error indicators
- Verify data type compatibility
- Ensure all required inputs are connected

### Name Your Variables

- Use descriptive output variable names
- Reference variables consistently
- Document complex mappings

### Use Comments

- Add Comment nodes to explain complex flows
- Group related connections with Group nodes

## Troubleshooting

### Connection Won't Create

1. Check handle compatibility (output → input)
2. Verify types are compatible
3. Ensure no cycles would be created
4. Check if target already has maximum connections

### Connection Disappears

1. May have been deleted accidentally (Cmd+Z to undo)
2. Check if source or target node was deleted
3. Verify connection is not hidden by another node

### Data Not Flowing

1. Verify connection is properly attached
2. Check variable references in downstream nodes
3. Ensure aggregation node is present before output

## Next Steps

- [Nodes](/pattern-builder/nodes) - Node reference
- [Exporting](/pattern-builder/exporting) - Export patterns
- [Overview](/pattern-builder/overview) - Getting started
