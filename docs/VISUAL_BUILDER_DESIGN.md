# Visual Pattern Builder Design

> **Design Document for the Parallax Pattern Builder UI**

## Table of Contents

1. [Overview](#overview)
2. [Competitive Analysis](#competitive-analysis)
3. [Design Principles](#design-principles)
4. [User Personas](#user-personas)
5. [User Flows](#user-flows)
6. [Node Types](#node-types)
7. [UI Components](#ui-components)
8. [Technical Architecture](#technical-architecture)
9. [Open Questions](#open-questions)

---

## Overview

The Visual Pattern Builder enables users to create Parallax orchestration patterns through a drag-and-drop interface, without writing YAML or Prism code directly.

### Goals

1. **Accessibility** - Non-developers can create patterns
2. **Speed** - Faster than writing code for common patterns
3. **Correctness** - Impossible to create invalid patterns
4. **Education** - Teaches orchestration concepts through doing

### Output Flow

```
Visual Builder (React Flow) → YAML → Prism → Parallax Runtime
```

---

## Competitive Analysis

### 1. n8n (Workflow Automation)

**What they do well:**
- Clean, minimal node design with clear input/output ports
- Sticky notes for documentation
- Split view: canvas + configuration panel
- Node search with categories
- Execution preview shows data at each step
- Keyboard shortcuts for power users

**What could be better:**
- Can feel cluttered with many connections
- No template gallery on canvas
- Limited undo/redo visibility

**Relevance to Parallax:**
- Their node design is excellent for AI workflows
- Split canvas/config panel is intuitive
- Execution preview would be valuable for confidence visualization

---

### 2. Zapier (No-Code Automation)

**What they do well:**
- Linear flow visualization (simple mental model)
- Step-by-step wizard for configuration
- Testing at each step
- Plain English descriptions of what each step does

**What could be better:**
- Linear only - no parallel branches visible
- Hides complexity (can be confusing when things break)
- No canvas view for complex flows

**Relevance to Parallax:**
- Step-by-step wizard good for beginners
- Plain English descriptions essential
- But we need canvas for parallel patterns

---

### 3. Retool Workflows

**What they do well:**
- Clean visual distinction between node types (triggers, actions, logic)
- Inline code editors where needed
- Run history with detailed logs
- Branch visualization for conditionals

**What could be better:**
- Dense UI can be overwhelming
- Limited template library

**Relevance to Parallax:**
- Branch visualization important for our consensus patterns
- Run history useful for debugging confidence issues

---

### 4. Langflow / Flowise (LLM-Specific)

**What they do well:**
- LLM-native concepts (prompts, chains, memory)
- Component library specific to AI
- Live preview of outputs
- Export to code

**What could be better:**
- Can be overwhelming with too many node types
- Documentation links aren't always accessible
- Connections can get messy

**Relevance to Parallax:**
- Most relevant competitors - same domain
- Our confidence propagation is differentiator
- Need better organization than these tools

---

### 5. Apache Airflow / Prefect / Temporal

**What they do well:**
- DAG visualization
- Clear dependency arrows
- Execution status per node
- Retry/failure handling visible

**What could be better:**
- Developer-focused, not accessible
- Heavy infrastructure concepts exposed

**Relevance to Parallax:**
- DAG concept maps to our pipelines
- Execution status visualization valuable

---

### Key Takeaways

| Feature | Best Example | Apply to Parallax |
|---------|--------------|-------------------|
| Node design | n8n | Clean cards with clear ports |
| Configuration | Zapier | Step-by-step with plain English |
| Parallel flows | Retool | Clear branch visualization |
| AI concepts | Langflow | Confidence-aware components |
| Execution view | Airflow | Status + confidence per node |
| Templates | Zapier | Start from working examples |

---

## Design Principles

### 1. Progressive Disclosure

**Principle:** Show only what's needed at each step.

**Implementation:**
- Start with 10 flow type templates (not 40 primitives)
- Expand to primitives only when customizing
- Advanced options hidden by default

### 2. Immediate Feedback

**Principle:** Users see results of changes instantly.

**Implementation:**
- Live YAML preview (collapsible)
- Confidence estimates shown on connections
- Validation errors inline, not in dialogs

### 3. Impossible States Are Impossible

**Principle:** UI prevents invalid configurations.

**Implementation:**
- Type-safe connections (can't connect incompatible nodes)
- Required fields enforced before save
- Pattern validates before export

### 4. Start with Success

**Principle:** Users should succeed on first attempt.

**Implementation:**
- Template gallery as default start
- Guided tutorials for each pattern type
- Pre-filled example values

### 5. Escape Hatches for Power Users

**Principle:** Don't limit experts.

**Implementation:**
- View/edit raw YAML anytime
- Keyboard shortcuts
- Custom Prism code injection (advanced)

---

## User Personas

### 1. Product Manager ("The Automator")

**Background:**
- Non-technical but understands the business problem
- Has used Zapier or similar tools
- Wants to automate AI workflows without engineering

**Needs:**
- Templates that work out of the box
- Plain English configuration
- Easy testing without deployment

**Pain points:**
- Intimidated by code
- Doesn't understand confidence/uncertainty
- Needs to explain patterns to stakeholders

---

### 2. ML Engineer ("The Optimizer")

**Background:**
- Comfortable with code but prefers visual tools for prototyping
- Understands AI/ML concepts deeply
- Wants to experiment with orchestration strategies

**Needs:**
- Quick iteration on pattern designs
- Access to underlying YAML/Prism
- Detailed confidence/metrics view

**Pain points:**
- Visual tools often too limited
- Wants keyboard shortcuts, not just clicking
- Needs export to code for production

---

### 3. Solutions Architect ("The Integrator")

**Background:**
- Designs systems for enterprise clients
- Needs to demonstrate patterns to stakeholders
- Creates reusable templates for teams

**Needs:**
- Professional-looking flow diagrams
- Export to documentation
- Version control integration

**Pain points:**
- Tools that look "toy-like"
- Can't share patterns easily
- No audit trail

---

## User Flows

### Flow 1: Create from Template (Beginner)

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Landing                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  "What do you want to build?"                                │    │
│  │                                                              │    │
│  │  [Multi-Model Consensus]  [Quality Gate]  [Pipeline]        │    │
│  │  [Content Moderation]     [Document Analysis]  [Custom]     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Template Preview                                                 │
│  ┌──────────────────────────────────┬──────────────────────────┐    │
│  │                                  │  Multi-Model Consensus    │    │
│  │   ┌───┐    ┌───┐    ┌───┐       │                          │    │
│  │   │ A │───▶│ ⊕ │───▶│ ✓ │       │  Query multiple AI       │    │
│  │   └───┘    └───┘    └───┘       │  models and combine      │    │
│  │   ┌───┐      ▲                  │  their responses.        │    │
│  │   │ B │──────┘                  │                          │    │
│  │   └───┘                         │  Best for:               │    │
│  │   ┌───┐      ▲                  │  • High-stakes decisions │    │
│  │   │ C │──────┘                  │  • Reducing hallucination│    │
│  │                                  │  • Multi-perspective     │    │
│  │  [Use This Template]            │                          │    │
│  └──────────────────────────────────┴──────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Configure (Step-by-Step)                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Step 1 of 3: Define Input                                   │    │
│  │                                                              │    │
│  │  What data will this pattern receive?                       │    │
│  │                                                              │    │
│  │  Field name: [query____________]                            │    │
│  │  Type:       [String ▼]                                     │    │
│  │  Required:   [✓]                                            │    │
│  │                                                              │    │
│  │  [+ Add another field]                                      │    │
│  │                                                              │    │
│  │                               [Back]  [Next: Agent Config]   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Test & Save                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Test your pattern                                           │    │
│  │                                                              │    │
│  │  Sample input:                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │ { "query": "What is the capital of France?" }        │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                              │    │
│  │  [▶ Run Test]                                               │    │
│  │                                                              │    │
│  │  Results:                  Confidence: 0.94 ████████████░   │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │ { "answer": "Paris", "sources": [...] }              │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  │                                                              │    │
│  │                               [Back]  [Save Pattern]         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Flow 2: Build Custom (Intermediate)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Canvas View                                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ┌─────────┐                                                    │  │
│  │ │ Palette │  ┌──────────────────────────────────────────────┐ │  │
│  │ ├─────────┤  │                                              │ │  │
│  │ │ ▶ Input │  │    ┌─────────┐        ┌─────────┐           │ │  │
│  │ │ ▶ Agents│  │    │  Input  │───────▶│ Parallel│──┐        │ │  │
│  │ │ ▶ Logic │  │    │  query  │        │ 3 agents│  │        │ │  │
│  │ │ ▶ Output│  │    └─────────┘        └─────────┘  │        │ │  │
│  │ │         │  │                                     │        │ │  │
│  │ │ ─────── │  │                       ┌─────────┐  │        │ │  │
│  │ │ Popular │  │                       │Consensus│◀─┘        │ │  │
│  │ │ ○ Vote  │  │                       │  0.8    │           │ │  │
│  │ │ ○ Merge │  │                       └────┬────┘           │ │  │
│  │ │ ○ Gate  │  │                            │                │ │  │
│  │ │         │  │                       ┌────▼────┐           │ │  │
│  │ └─────────┘  │                       │ Output  │           │ │  │
│  │              │                       │ result  │           │ │  │
│  │              │                       └─────────┘           │ │  │
│  │              │                                              │ │  │
│  │              └──────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  │  [Test] [Export YAML] [Save]                    Zoom: 100%    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Properties: Consensus Node                                     │  │
│  │                                                                │  │
│  │ Strategy:    [Majority Vote ▼]                                │  │
│  │ Threshold:   [0.8_____] (confidence required for agreement)   │  │
│  │ Min Votes:   [3_______]                                       │  │
│  │                                                                │  │
│  │ ▶ Advanced Options                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Flow 3: View YAML/Export (Power User)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Split View                                                          │
│  ┌────────────────────────────┬──────────────────────────────────┐  │
│  │ Visual                     │ YAML                              │  │
│  │                            │                                   │  │
│  │  ┌───────┐   ┌───────┐    │  name: MultiModelConsensus       │  │
│  │  │ Input │──▶│Parallel│   │  description: Query multiple...  │  │
│  │  └───────┘   └───┬───┘    │                                   │  │
│  │                  │        │  input:                           │  │
│  │            ┌─────▼─────┐  │    query: string                  │  │
│  │            │ Consensus │  │                                   │  │
│  │            └─────┬─────┘  │  agents:                          │  │
│  │                  │        │    capabilities: [inference]      │  │
│  │            ┌─────▼─────┐  │    min: 3                         │  │
│  │            │  Output   │  │                                   │  │
│  │            └───────────┘  │  aggregation:                     │  │
│  │                           │    strategy: consensus            │  │
│  │                           │    threshold: 0.8                 │  │
│  │                           │                                   │  │
│  │                           │  output:                          │  │
│  │                           │    result: $validResults          │  │
│  │                           │                                   │  │
│  │                           │  confidence: average              │  │
│  │                           │                                   │  │
│  └────────────────────────────┴──────────────────────────────────┘  │
│                                                                      │
│  [Copy YAML] [Download .yaml] [Export to Prism] [Copy to Clipboard] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Node Types

### Core Nodes (Always Visible)

| Node | Icon | Purpose | Inputs | Outputs |
|------|------|---------|--------|---------|
| **Input** | `→` | Define pattern inputs | None | Data |
| **Output** | `←` | Define pattern outputs | Data | None |
| **Agents** | `◉` | Configure agent selection | Data | Results[] |

### Flow Type Nodes (Primary Templates)

| Node | Icon | Purpose | Maps To |
|------|------|---------|---------|
| **Parallel** | `⫘` | Run multiple agents simultaneously | `parallel` |
| **Pipeline** | `→→` | Sequential multi-stage processing | `sequential`, `pipeline` |
| **Voting** | `✋` | Democratic decision-making | `voting`, `consensus` |
| **Quality Gate** | `✓` | Threshold-based filtering | `threshold` |
| **Race** | `🏁` | First response wins | `race` |
| **Delegate** | `↓` | Hierarchical task assignment | `delegate` |

### Aggregation Nodes

| Node | Icon | Purpose |
|------|------|---------|
| **Consensus** | `∩` | Build agreement from results |
| **Merge** | `⊕` | Combine results into one |
| **Reduce** | `Σ` | Fold multiple results |
| **Best** | `★` | Select highest confidence |

### Control Nodes (Advanced)

| Node | Icon | Purpose |
|------|------|---------|
| **Retry** | `↻` | Retry on failure |
| **Fallback** | `↓` | Use backup on failure |
| **Escalate** | `↑` | Pass to higher authority |
| **Timeout** | `⏱` | Time limit |

### Logic Nodes

| Node | Icon | Purpose |
|------|------|---------|
| **Condition** | `?` | Branch based on condition |
| **Loop** | `⟳` | Iterate over items |
| **Partition** | `▤` | Split data into groups |

---

## UI Components

### 1. Node Card

```
┌─────────────────────────────────┐
│ ◉ Parallel Agents               │
├─────────────────────────────────┤
│                                 │
│  ○ ──────────────────────── ○   │  ← Input/Output ports
│                                 │
│  Agents: 3                      │  ← Summary info
│  Capabilities: inference        │
│                                 │
│  Confidence: ~0.85             │  ← Estimated confidence
│                                 │
└─────────────────────────────────┘
```

### 2. Connection Line

```
─────●━━━━━━━━━━━━━━━━━━●─────
     ↑                   ↑
  Source port       Target port

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Confidence: 0.92

(Line thickness/color indicates confidence)
```

### 3. Property Panel

```
┌─────────────────────────────────┐
│ Consensus Node                  │
│ ════════════════════════════    │
│                                 │
│ Strategy                        │
│ ┌─────────────────────────────┐ │
│ │ Majority Vote            ▼  │ │
│ └─────────────────────────────┘ │
│                                 │
│ Threshold                       │
│ ┌─────────────────────────────┐ │
│ │ 0.8                         │ │
│ └─────────────────────────────┘ │
│ Minimum confidence for consensus│
│                                 │
│ Min Votes                       │
│ ┌─────────────────────────────┐ │
│ │ 3                           │ │
│ └─────────────────────────────┘ │
│                                 │
│ ▶ Advanced Options              │
│                                 │
└─────────────────────────────────┘
```

### 4. Confidence Indicator

```
Confidence: 0.85

Low         Medium        High
├────────────┼────────────┼────────────┤
░░░░░░░░░░░░████████████████░░░░░░░░░░░
                    ▲
                  0.85
```

---

## Technical Architecture

### Package Structure

```
packages/
  pattern-builder/
    src/
      components/
        Canvas/
          Canvas.tsx           # Main React Flow canvas
          Background.tsx       # Grid/dots background
          MiniMap.tsx         # Navigation minimap
        Nodes/
          BaseNode.tsx        # Common node wrapper
          InputNode.tsx       # Pattern input definition
          OutputNode.tsx      # Pattern output definition
          AgentsNode.tsx      # Agent configuration
          ParallelNode.tsx    # Parallel execution
          PipelineNode.tsx    # Sequential pipeline
          ConsensusNode.tsx   # Voting/consensus
          ThresholdNode.tsx   # Quality gate
          ...
        Edges/
          ConfidenceEdge.tsx  # Edge with confidence display
        Panels/
          PropertiesPanel.tsx # Node configuration
          YamlPreview.tsx     # Live YAML output
          TestPanel.tsx       # Test execution
        Palette/
          NodePalette.tsx     # Draggable node list
          TemplateGallery.tsx # Pattern templates
      hooks/
        usePatternState.ts    # Pattern state management
        useYamlExport.ts      # Convert flow to YAML
        useValidation.ts      # Real-time validation
      utils/
        flowToYaml.ts         # Flow → YAML conversion
        yamlToFlow.ts         # YAML → Flow (import)
        validation.ts         # Pattern validation
      types/
        nodes.ts              # Node type definitions
        edges.ts              # Edge type definitions
        pattern.ts            # Pattern types
      index.tsx               # <PatternBuilder /> export
    package.json
```

### Dependencies

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "reactflow": "^11.0.0",
    "@parallax/pattern-sdk": "workspace:*",
    "zustand": "^4.0.0",
    "zod": "^3.0.0"
  }
}
```

### State Management

```typescript
interface PatternBuilderState {
  // Flow state
  nodes: Node[];
  edges: Edge[];

  // Selection
  selectedNodeId: string | null;

  // Validation
  errors: ValidationError[];
  warnings: ValidationWarning[];

  // Output
  yaml: string;
  isValid: boolean;

  // Actions
  addNode: (type: NodeType, position: Position) => void;
  updateNode: (id: string, data: Partial<NodeData>) => void;
  removeNode: (id: string) => void;
  connect: (source: string, target: string) => void;
  exportYaml: () => string;
  importYaml: (yaml: string) => void;
}
```

---

## Open Questions

### UX Questions

1. **Should we support undo/redo?**
   - Yes, essential for exploration
   - How many levels? (Suggest: unlimited with compression)

2. **How to handle large patterns?**
   - Minimap for navigation
   - Collapse/expand groups?
   - Sub-patterns (composition)?

3. **Should YAML be editable?**
   - View-only is simpler
   - Editable allows power users to tweak
   - Risk: visual and YAML get out of sync

4. **How to show execution results?**
   - Inline on nodes (like n8n)
   - Separate panel
   - Both?

5. **Dark mode?**
   - Yes, developers expect it
   - Need high-contrast confidence indicators

### Technical Questions

1. **Where does the builder run?**
   - Standalone app in Parallax repo
   - Embedded in Raven Docs
   - Both (shared component)

2. **How to persist patterns?**
   - Local storage for drafts
   - Export to file
   - Save to Parallax server (needs auth)

3. **Real-time collaboration?**
   - Not for V1
   - Consider Yjs/CRDT for V2

4. **Mobile support?**
   - Not for V1 (canvas interactions don't work well)
   - Responsive property panels only

---

## Next Steps

1. **Finalize node types** - Review with team
2. **Create Figma mockups** - Visual design
3. **Prototype core canvas** - React Flow setup
4. **Implement flow-to-YAML** - Core conversion logic
5. **Build template gallery** - Starting templates
6. **Add property panels** - Node configuration
7. **Testing integration** - Run patterns from builder
