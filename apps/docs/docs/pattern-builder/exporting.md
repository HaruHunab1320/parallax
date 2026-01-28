---
sidebar_position: 4
title: Exporting
---

# Exporting Patterns

Export your visual patterns to deployable configuration formats.

## Export Formats

### YAML Format

Standard Parallax pattern format for use with the SDK and CLI.

**Use for:**
- SDK integration (`client.registerPattern()`)
- CLI deployment (`parallax pattern deploy`)
- Version control
- Manual editing

**Example Output:**

```yaml
name: content-classifier
version: 1.0.0
description: Classify content using multi-agent voting

input:
  content:
    type: string
    required: true

agents:
  capabilities: [classification]
  min: 3

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: voting
  method: majority
  minVotes: 2

validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 2

output:
  category: $vote.result
  confidence: $vote.confidence
```

### Prism Format

Domain-specific language for complex orchestrations.

**Use for:**
- Advanced patterns
- Multi-step workflows
- Pattern composition
- Runtime optimization

**Example Output:**

```prism
pattern content-classifier {
  version "1.0.0"

  input {
    content: string @required
  }

  agents classification {
    capabilities: [classification]
    min: 3
  }

  execute parallel {
    timeout: 30s
  }

  aggregate voting {
    method: majority
    minVotes: 2
  }

  validate {
    minConfidence: 0.7
    onFailure: retry(2)
  }

  output {
    category: $vote.result
    confidence: $vote.confidence
  }
}
```

### JSON Format

Machine-readable format for programmatic use.

**Use for:**
- API integration
- Programmatic generation
- Tool interoperability

## Exporting

### From the Toolbar

1. Click **Export** in the toolbar
2. Select format:
   - **Export YAML** - Standard format
   - **Export Prism** - DSL format
   - **Export JSON** - Machine format
3. Choose action:
   - **Copy to Clipboard**
   - **Download File**
   - **Deploy to Control Plane** (if connected)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + E` | Open export dialog |
| `Cmd/Ctrl + Shift + C` | Copy YAML to clipboard |
| `Cmd/Ctrl + Shift + S` | Save/download file |

### Export Options

When exporting, you can configure:

| Option | Description |
|--------|-------------|
| Include Comments | Add documentation comments |
| Include Metadata | Include author, timestamp |
| Minify | Remove whitespace (JSON only) |
| Validate | Validate before export |

## Validation Before Export

The builder validates patterns before export:

### Pre-export Checks

1. **Required nodes**: Input and Output nodes exist
2. **Connections**: All nodes properly connected
3. **Configuration**: Required fields filled
4. **Types**: Data types compatible
5. **Variables**: All references valid

### Validation Errors

If validation fails, you'll see:

```
❌ Export failed - 2 errors found:

1. Agent node missing capabilities
   → Configure at least one capability

2. Output references undefined variable: $results.data
   → Check variable name or add source node
```

### Fix and Retry

1. Click on the error to highlight the problem node
2. Fix the configuration
3. Click **Export** again

## Importing

### Import YAML

Load existing patterns into the builder:

1. Click **File → Import**
2. Select YAML file or paste content
3. Pattern loads onto canvas

### Import from Examples

1. Click **Examples** in toolbar
2. Select an example pattern
3. Pattern loads onto canvas
4. Modify as needed

### Import Limitations

Some patterns may not fully import:

| Feature | Support |
|---------|---------|
| Basic patterns | Full support |
| Multi-step | Full support |
| Complex conditionals | Partial support |
| Custom primitives | Not supported |
| Pattern composition | Partial support |

## Deployment

### Direct Deploy

Deploy directly from the builder:

1. Click **Export → Deploy to Control Plane**
2. Select target environment
3. Confirm deployment

Requires:
- Connected to control plane
- Appropriate permissions
- Valid pattern

### CLI Deploy

Deploy exported files via CLI:

```bash
# Validate first
parallax pattern validate my-pattern.yaml

# Deploy to local
parallax pattern deploy my-pattern.yaml

# Deploy to specific environment
parallax pattern deploy my-pattern.yaml --env production
```

### SDK Deploy

Deploy programmatically:

```typescript
import { ParallaxClient } from '@parallax/sdk-typescript';
import fs from 'fs';

const client = new ParallaxClient({ url: 'http://localhost:8080' });

const yaml = fs.readFileSync('my-pattern.yaml', 'utf-8');
await client.registerPattern(yaml);
```

## Version Management

### Pattern Versioning

Set version in the pattern metadata:

```yaml
name: my-pattern
version: 2.1.0  # Semantic versioning
```

### Updating Patterns

When updating an existing pattern:

1. Increment version number
2. Export new version
3. Deploy (old versions remain available)

### Version Selection

Clients can select versions:

```typescript
// Exact version
client.executePattern('my-pattern', input, { version: '2.1.0' });

// Version range
client.executePattern('my-pattern', input, { version: '2.x' });

// Latest
client.executePattern('my-pattern', input, { version: 'latest' });
```

## Export Troubleshooting

### "Cannot export: validation failed"

**Cause**: Pattern has configuration errors

**Solution**:
1. Check the error panel
2. Fix highlighted issues
3. Retry export

### "YAML generation failed"

**Cause**: Complex pattern structure

**Solution**:
1. Simplify pattern
2. Check for unsupported features
3. Try JSON export instead

### "Prism compilation failed"

**Cause**: Pattern uses features not supported in Prism

**Solution**:
1. Use YAML format instead
2. Simplify complex conditions
3. Check Prism documentation for supported features

### Exported YAML differs from preview

**Cause**: Preview may not show all options

**Solution**:
1. This is expected for optional fields
2. Exported YAML is canonical
3. Both are functionally equivalent

## Best Practices

### Before Export

1. **Validate thoroughly** - Fix all errors and warnings
2. **Test with examples** - Try sample inputs mentally
3. **Review connections** - Ensure data flows correctly
4. **Check variable names** - Consistent, descriptive names

### File Management

1. **Use version control** - Commit pattern files
2. **Name consistently** - `{name}-v{version}.yaml`
3. **Include metadata** - Author, date, description
4. **Keep backups** - Save before major changes

### Deployment

1. **Test locally first** - Use local control plane
2. **Validate in staging** - Before production
3. **Monitor after deploy** - Check metrics
4. **Rollback plan** - Know how to revert

## Next Steps

- [Overview](/docs/pattern-builder/overview) - Builder guide
- [YAML Syntax](/docs/patterns/yaml-syntax) - YAML reference
- [Executing Patterns](/docs/sdk/executing-patterns) - Using exported patterns
