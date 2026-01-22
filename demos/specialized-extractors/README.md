# Specialized Extractors Demo

A document extraction pipeline that uses specialized agents to extract different types of structured data from unstructured text, demonstrating Parallax's ability to coordinate parallel analysis and merge results.

## What This Demo Proves

1. **Specialized agents** - Each agent focuses on one extraction type (dates, amounts, names, addresses)
2. **Parallel processing** - All agents analyze the document simultaneously
3. **Result merging** - Prism pattern combines extractions into unified output
4. **Small models win** - Focused prompts + fast models beat one big generalist

## Architecture

```
                         Unstructured Document
                                  |
                                  v
+-------------------------------------------------------------+
|                      Control Plane                           |
|                 (Prism Extraction Pattern)                   |
+-------------------------------------------------------------+
                                  |
        +------------+------------+------------+
        |            |            |            |
        v            v            v            v
  +-----------+ +-----------+ +-----------+ +-----------+
  |   Date    | |  Amount   | |  Entity   | | Address   |
  | Extractor | | Extractor | | Extractor | | Extractor |
  +-----------+ +-----------+ +-----------+ +-----------+
        |            |            |            |
        +------------+------------+------------+
                                  |
                                  v
+-------------------------------------------------------------+
|                     Merged Output                            |
|  {                                                           |
|    "dates": [...],                                           |
|    "amounts": [...],                                         |
|    "entities": { "people": [...], "organizations": [...] },  |
|    "addresses": [...]                                        |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Focus | Port | Extracts |
|-------|-------|------|----------|
| Date Extractor | Temporal data | 50300 | Dates in any format, normalized to ISO 8601 |
| Amount Extractor | Financial data | 50301 | Currency amounts with type classification |
| Entity Extractor | Named entities | 50302 | People names, organization names |
| Address Extractor | Location data | 50303 | Physical addresses, parsed into components |

## Prerequisites

- Docker (for etcd and PostgreSQL)
- Node.js 18+ / pnpm
- `GEMINI_API_KEY` environment variable set

## Running the Demo

### 1. Start Infrastructure (from repo root)

```bash
docker-compose up -d
```

### 2. Start Control Plane

```bash
# Terminal 1
cd packages/control-plane
pnpm dev
```

Wait for: `Control Plane HTTP listening on port 8080`

### 3. Start Extraction Agents (4 terminals)

```bash
# Terminal 2 - Date Extractor
cd demos/specialized-extractors
pnpm agent:date

# Terminal 3 - Amount Extractor
cd demos/specialized-extractors
pnpm agent:amount

# Terminal 4 - Entity Extractor
cd demos/specialized-extractors
pnpm agent:entity

# Terminal 5 - Address Extractor
cd demos/specialized-extractors
pnpm agent:address
```

### 4. Run Extractions

```bash
# Terminal 6
cd demos/specialized-extractors

# Extract from an invoice
pnpm extract examples/invoice.txt

# Extract from a contract
pnpm extract examples/contract.txt

# Extract from an email
pnpm extract examples/email.txt

# Extract from inline text
pnpm extract "John Smith paid $500 to Acme Corp on Jan 15, 2024 at 123 Main St, NYC 10001"
```

## Example Output

```
══════════════════════════════════════════════════════════════════════
                    EXTRACTION RESULTS
══════════════════════════════════════════════════════════════════════

Document: "INVOICE #INV-2024-0042..."

Total Extractions: 15
Overall Confidence: 92%

Extracted 15 items: 2 dates, 6 amounts, 4 entities, 3 addresses

──────────────────────────────────────────────────────────────────────
  DATES (2 found)
──────────────────────────────────────────────────────────────────────
    "January 15, 2024" → 2024-01-15
      Type: invoice date, Confidence: 95%
    "February 15, 2024" → 2024-02-15
      Type: due date, Confidence: 95%

──────────────────────────────────────────────────────────────────────
  AMOUNTS (6 found)
──────────────────────────────────────────────────────────────────────
    "$6,000.00" → USD 6,000
      Type: line item total, Confidence: 98%
    "$13,639.50" → USD 13,639.50
      Type: total due, Confidence: 99%
    ...

──────────────────────────────────────────────────────────────────────
  ENTITIES (4 found)
──────────────────────────────────────────────────────────────────────
    People: John Smith, Sarah Johnson
    Organizations: Acme Corporation, TechStart Inc.

──────────────────────────────────────────────────────────────────────
  ADDRESSES (3 found)
──────────────────────────────────────────────────────────────────────
    123 Business Park Drive, Suite 500
    San Francisco, CA 94107
    United States
      Type: sender address, Confidence: 95%
    ...

══════════════════════════════════════════════════════════════════════
```

## The Prism Pattern

The extraction logic lives in `patterns/extraction.prism`:

```prism
// Collect results from all extraction agents
results = agentResults
validResults = results.filter(r => r.confidence > 0 && r.result)

// Extract from each specialized agent
dateResults = validResults.filter(r => r.agentId == "date-extractor")
dates = dateResults.length > 0 ? dateResults.reduce((acc, r) => r.result.dates, []) : []

// ... similar for amounts, entities, addresses

// Merge into unified output
output = {
  extractions: { dates, amounts, entities, addresses },
  summary: { totalItems, breakdown, message },
  confidence: avgConfidence
}
```

## Why This Matters

This demo shows that Parallax enables:

1. **Divide and conquer** - Complex extraction broken into focused subtasks
2. **Parallel efficiency** - 4 agents run simultaneously, faster than sequential
3. **Specialized prompts** - Each agent has a targeted prompt for its domain
4. **Easy extensibility** - Add new extractors (phone numbers, URLs, etc.) without changing others
5. **Confidence tracking** - Know which extractions are reliable

Use cases:
- **Invoice processing** - Automated AP/AR data extraction
- **Contract analysis** - Extract key terms, parties, dates
- **Resume parsing** - Pull out skills, experience, contact info
- **Email triage** - Identify action items, deadlines, stakeholders
- **Document digitization** - Convert scanned docs to structured data
