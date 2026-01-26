# Parallax Documentation

## Primary Documents

### Core References
- **[/ARCHITECTURE.md](/ARCHITECTURE.md)** - Complete system architecture (single source of truth)
- **[/ROADMAP.md](/ROADMAP.md)** - Feature checklist and completion status
- **[/README.md](/README.md)** - Getting started guide
- **[AGENT_RUNTIME_SUPPORT_DEVELOPMENT.md](AGENT_RUNTIME_SUPPORT_DEVELOPMENT.md)** - Agent runtime roadmap (local + managed)

### Implementation
- **[archive/IMPLEMENTATION_ROADMAP.md](archive/IMPLEMENTATION_ROADMAP.md)** - Archived; superseded by `/ROADMAP.md`
- **[REVISED_OPENSOURCE_STRATEGY.md](REVISED_OPENSOURCE_STRATEGY.md)** - Current business model (no agent limits)
- **[archive/OPEN_SOURCE_LAUNCH_STRATEGY.md](archive/OPEN_SOURCE_LAUNCH_STRATEGY.md)** - Archived; superseded by REVISED_OPENSOURCE_STRATEGY.md

## Archived Documents

Historical documents are preserved in [/docs/archive/](archive/) for reference:
- System architecture (superseded by /ARCHITECTURE.md)
- Package architecture (superseded by /ARCHITECTURE.md)
- Old business strategy with agent limits
- Completed reorganization plans
- Pattern generation gap analysis (merged into PATTERN_SDK_ARCHITECTURE.md)

## Document Organization

```
parallax/
├── ARCHITECTURE.md          # Single source of truth for architecture
├── ROADMAP.md              # Feature checklist and status
├── README.md               # Getting started
└── docs/
    ├── DOC_README.md       # This file
    ├── REVISED_OPENSOURCE_STRATEGY.md # Current business model
    └── archive/            # Historical documents
```

## Contributing to Documentation

When updating documentation:
1. Update the primary document (ARCHITECTURE.md or ROADMAP.md)
2. Keep implementation details in docs/ folder
3. Archive outdated documents with explanation
4. Maintain single source of truth principle
