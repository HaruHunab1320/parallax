# Parallax Demo Ideas

A prioritized list of real-world demos that showcase Parallax's value as an agent orchestration platform.

---

## Demo 1: PR Review Bot ✅ COMPLETE

**Status:** Fully tested and working (January 2026)

**Location:** `demos/pr-review-bot/`

**What it does:**
- 4 agents (Security, Style, Docs, Test) analyze code from different angles
- Python + TypeScript agents working together via gRPC
- Prism pattern synthesizes findings and makes recommendation
- Real Gemini LLM integration with pattern-based fallback

**Value prop:** "Multi-perspective code review with specialized agents"

**Agents:**
- Security Agent (Python, port 50100) - vulnerabilities, injection, hardcoded secrets
- Style Agent (TypeScript, port 50101) - complexity, naming, best practices
- Docs Agent (TypeScript, port 50102) - missing documentation, clarity
- Test Agent (Python, port 50103) - testability, coverage indicators

**Sample Output:**
- 4 agents, 34 findings, 91% consensus confidence
- Recommendation: BLOCK (due to critical SQL injection vulnerabilities)
- Findings broken down by severity: Critical: 2, High: 11, Medium: 14, Low: 7

**Lessons Learned:**
- Prism only supports `map`, `filter`, `reduce` for arrays (no `concat`, `some`, spread)
- Reserved keywords (`high`, `medium`, `low`, `critical`) must be quoted in object properties
- ConfidenceValue objects need to be unwrapped to plain JS objects
- Python SDK method names are capitalized (`Register`, not `register`)

---

## Demo 2: Multi-Model Voting ✅ COMPLETE

**Status:** Fully tested and working (January 2026)

**Location:** `demos/multi-model-voting/`

**What it does:**
```
Input: A question or decision that needs high confidence

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Gemini 2.0 Flash│  │ Gemini 3 Pro    │  │ Gemini 3 Flash  │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         └───────────────────┼───────────────────┘
                             ▼
                   Voting pattern:
                   - Unanimous agreement → high confidence
                   - 2/3 agreement → moderate confidence
                   - All different → flag for human
```

**Value prop:** "Critical decisions through multiple models, automatic consensus"

**Use cases:**
- Content moderation (is this toxic?)
- Fraud detection (is this suspicious?)
- Medical triage (how urgent is this?)
- Legal review (is this compliant?)

**Agents:**
- Gemini 2.0 Flash Voter (TypeScript, port 50200) - fast, balanced reasoning
- Gemini 3 Pro Voter (TypeScript, port 50201) - most capable, detailed reasoning
- Gemini 3 Flash Voter (TypeScript, port 50202) - fast, efficient

**Sample Output:**
```
════════════════════════════════════════════════════════════
                    VOTING RESULTS
════════════════════════════════════════════════════════════

Question: Is this content appropriate for a general audience?

Decision: APPROPRIATE
Consensus: ✅ UNANIMOUS
Confidence: 98%
Votes: 3/3 for winner

3 models voted unanimously for: appropriate

Individual Votes:
────────────────────────────────────────────────────────────

  Gemini Flash Lite Voter (gemini-2.0-flash-lite)
    Vote: appropriate
    Confidence: 95%
    The content describes a positive experience of a hike...

  Gemini 2.0 Flash Voter (gemini-2.0-flash)
    Vote: appropriate
    Confidence: 100%
    The content describes a scenic hike and shares a positive experience...

  Gemini 3 Pro Voter (gemini-3-pro-preview)
    Vote: appropriate
    Confidence: 100%
    The content describes a safe, recreational activity (hiking)...

════════════════════════════════════════════════════════════
```

**Lessons Learned:**
- Prism filter/map lambdas only receive 1 argument (use `reduce` for index-based logic)
- Pattern names must include keywords like "voting" to trigger agent invocation
- TracedPatternEngine is used by default (not PatternEngine) - changes must be made to both
- Agent capabilities lookup: `service.capabilities || service.metadata?.capabilities`
- Gemini model names change frequently - use latest stable names (gemini-3-pro-preview, gemini-3-flash-preview)

**Pattern logic:**
```prism
// Get first vote using reduce
firstVote = validResults.reduce((first, r) => first == "" ? r.result.decision : first, "")

// Check consensus
isUnanimous = matchFirst == validResults.length
hasMajority = matchFirst > majorityThreshold

consensusType = isUnanimous ? "unanimous"
  : hasMajority ? "majority"
  : "split"

needsHumanReview = consensusType == "split" || consensusConfidence < 0.6
```

---

## Demo 3: Specialized Extractors Pipeline ✅ COMPLETE

**Status:** Fully tested and working (January 2026)

**Location:** `demos/specialized-extractors/`

**Priority:** HIGH - Very practical for document processing

**What it does:**
```
Input: Unstructured text (invoice, contract, email)

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Date Agent   │  │ Amount Agent │  │ Name Agent   │  │ Address Agent│
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       └─────────────────┴─────────────────┴─────────────────┘
                                    ▼
                         Merged structured output:
                         {
                           dates: ["2024-01-15", "2024-02-15"],
                           amounts: ["$1,234.56"],
                           names: ["John Smith", "Acme Inc"],
                           addresses: ["123 Main St..."]
                         }
```

**Value prop:** "Small specialized models beat one big generalist"

**Use cases:**
- Invoice processing
- Contract analysis
- Resume parsing
- Email triage

**Agents:**
- Date Extractor (TypeScript, port 50300) - finds and normalizes dates to ISO 8601
- Amount Extractor (TypeScript, port 50301) - finds currency amounts with type classification
- Entity Extractor (TypeScript, port 50302) - names, organizations with roles
- Address Extractor (TypeScript, port 50303) - physical addresses parsed into components

**Sample Output:**
```
══════════════════════════════════════════════════════════════════════
                    EXTRACTION RESULTS
══════════════════════════════════════════════════════════════════════

Document: "INVOICE #INV-2024-0042..."

Total Extractions: 21
Overall Confidence: 100%

Extracted 21 items: 3 dates, 11 amounts, 5 entities, 2 addresses

  DATES (3 found)
    "January 15, 2024" → 2024-01-15
      Type: invoice date, Confidence: 100%
    "February 15, 2024" → 2024-02-15
      Type: due date, Confidence: 100%

  AMOUNTS (11 found)
    "$13,639.50" → USD 13,639.5
      Type: total, Confidence: 100%
    ...

  ENTITIES (5 found)
    People: John Smith, Sarah Johnson
    Organizations: Acme Corporation, TechStart Inc., First National Bank

  ADDRESSES (2 found)
    123 Business Park Drive, Suite 500
    San Francisco, CA 94107
    United States
      Type: business address, Confidence: 100%

══════════════════════════════════════════════════════════════════════
```

**Lessons Learned:**
- Pattern names must include keywords like "extraction" to trigger agent invocation
- "agents" is a reserved word in Prism - must be quoted in object literals
- ConfidenceValue wrapper needs to be unwrapped via `.value` in CLI
- All 4 agents run in parallel for fast extraction

**Why Parallax helps:**
- Each agent can be a small, fast, cheap model
- Easy to add new extractors without changing others
- Pattern handles merging and deduplication
- Parallel execution = faster than sequential

---

## Demo 4: RAG Quality Gate ✅ COMPLETE

**Status:** Fully tested and working (January 2026)

**Location:** `demos/rag-quality-gate/`

**What it does:**
```
RAG Pipeline Output:
  Question + Answer + Sources
              ↓
+-------------------------------------------------------------+
|                      Control Plane                           |
|                (Prism Quality Gate Pattern)                  |
+-------------------------------------------------------------+
              ↓
    +---------+---------+---------+
    ↓         ↓         ↓
┌─────────┐ ┌─────────┐ ┌─────────┐
│Grounded-│ │Relevance│ │Complete-│
│  ness   │ │ Checker │ │  ness   │
│ Checker │ │         │ │ Checker │
└────┬────┘ └────┬────┘ └────┬────┘
     └───────────┼───────────┘
                 ↓
         Quality Gate Result
```

**Value prop:** "Catch hallucinations before users see them"

**Use cases:**
- Customer support chatbots
- Documentation Q&A
- Legal research assistants
- Medical information systems

**Agents:**
- Groundedness Checker (TypeScript, port 50400) - Is the answer supported by the source docs?
- Relevance Checker (TypeScript, port 50401) - Does the answer address the question?
- Completeness Checker (TypeScript, port 50402) - Are all parts of the question answered?

**Sample Output - Good Response (APPROVED):**
```
══════════════════════════════════════════════════════════════════════
                    RAG QUALITY GATE RESULTS
══════════════════════════════════════════════════════════════════════

Question: "What are the main features of the Parallax agent orchestrati..."

Status: ✅ APPROVED
Overall Score: 100%
Checks: 3/3 passed

All quality checks passed - answer is grounded, relevant, and complete

  ✅ GROUNDEDNESS: 100%
     All claims are grounded in sources

  ✅ RELEVANCE: 100%
     Answer is on-topic and relevant

  ✅ COMPLETENESS: 100%
     All parts of the question are addressed

  RECOMMENDATION
  Return answer to user
══════════════════════════════════════════════════════════════════════
```

**Sample Output - Hallucinated Response (NEEDS_REVIEW):**
```
Status: ⚠️ NEEDS_REVIEW
Overall Score: 67%
Checks: 1/3 passed

  ❌ GROUNDEDNESS: 50%
     Hallucinations found:
       - Built-in machine learning models: Parallax comes with pre-trained GPT-4
         and Claude models that can be used directly without API keys.
       - Kubernetes auto-scaling: The platform automatically scales to thousands
         of agents using Kubernetes HPA and can handle millions of requests per second.
       - GraphQL API: All communication happens through a GraphQL API that supports
         real-time subscriptions.
       - Free enterprise tier: Parallax offers unlimited enterprise features at no cost.

  ✅ RELEVANCE: 100%
     Answer is on-topic and relevant

  ❌ COMPLETENESS: 50%
     Missing parts:
       - Agent registration and discovery mechanism
       - Communication protocol
       - Role of Prism and confidence-aware DSL

  RECOMMENDATION
  Flag for human review
```

**Sample Output - Incomplete Response (NEEDS_REVIEW):**
```
Status: ⚠️ NEEDS_REVIEW
Overall Score: 50%
Checks: 1/3 passed

  ❌ GROUNDEDNESS: 67%
  ✅ RELEVANCE: 100%
  ❌ COMPLETENESS: 33%
     Missing parts:
       - Installation instructions
       - Supported programming languages

  RECOMMENDATION
  Flag for human review
```

**Lessons Learned:**
- Pattern names must include keywords like "qualitygate" to trigger agent invocation
- All 3 quality check agents run in parallel for fast validation
- The completeness checker catches both missing answers AND detects when fabricated content replaced real information
- ConfidenceValue wrapper needs to be unwrapped via `.value` in CLI

**Pattern logic:**
```prism
// Collect results from all quality check agents
results = agentResults

// Get individual check results
groundednessPassed = groundednessCheck ? groundednessCheck.result.passed : false
relevancePassed = relevanceCheck ? relevanceCheck.result.passed : false
completenessPassed = completenessCheck ? completenessCheck.result.passed : false

// Calculate overall pass (all must pass)
allPassed = groundednessPassed && relevancePassed && completenessPassed

// Determine status
status = allPassed ? "approved"
  : failedChecks == totalChecks ? "rejected"
  : "needs_review"

output ~> avgScore
```

---

## Demo 5: Translation Verification Loop ✅ COMPLETE

**Status:** Fully tested and working (January 2026)

**Location:** `demos/translation-verification/`

**What it does:**
```
Input: Text + Target Language
              |
+-------------------------------------------------------------+
|                      Control Plane                           |
|             (Prism Translation Pattern)                      |
+-------------------------------------------------------------+
              |
    +---------+---------+---------+
    |         |         |
    v         v         v
+---------+ +---------+ +---------+
|Translator| |Round-Trip| |Quality |
|         | |Verifier | |Checker |
+---------+ +---------+ +---------+
    |         |         |
    v         v         v
Translation  Similarity  Fluency
             Score      Score
```

**Value prop:** "Automatic QA for translations via round-trip verification"

**Use cases:**
- Product localization
- Documentation translation
- Marketing content
- Legal document translation

**Agents:**
- Translator (TypeScript, port 50500) - Produces the primary translation
- Round-Trip Verifier (TypeScript, port 50501) - Translates forward+back, computes similarity
- Quality Checker (TypeScript, port 50502) - Evaluates fluency, grammar, style, cultural fit

**Sample Output - Simple Text (Approved, 98%):**
```
======================================================================
                    TRANSLATION RESULTS
======================================================================

Original: "Hello! Welcome to our company. We are very happy to have you..."
Direction: English -> Spanish

Status: ✅ APPROVED
Overall Score: 98%
Checks: 2/2 passed

Translation verified - round-trip similarity and quality checks passed

  TRANSLATION
  ¡Hola! Bienvenidos a nuestra empresa. Estamos muy contentos de
  tenerlos aquí...

  ROUND-TRIP VERIFICATION
  ✅ SIMILARITY: 100%
     Meaning fully preserved through round-trip

  QUALITY CHECK
  ✅ QUALITY SCORE: 95%
     Breakdown:
       Fluency:      100%
       Grammar:      100%
       Style:        100%
       Cultural Fit: 75%
     Issues: [minor] formality level suggestion

  RECOMMENDATION
  Use translation - quality verified
======================================================================
```

**Sample Output - Idiom-Heavy Text (Approved with nuance notes, 95%):**
```
Original: "When it rains, it pours! We've been burning the midnight oil..."

Status: ✅ APPROVED
Overall Score: 95%
Checks: 2/2 passed

  TRANSLATION
  ¡Cuando llueve, diluvia! Hemos estado trabajando hasta altas horas
  de la noche para terminar este proyecto...

  Notes: Several idioms were adapted:
    - 'When it rains, it pours' → 'Cuando llueve, diluvia'
    - 'Burning the midnight oil' → 'trabajando hasta altas horas'
    - 'Hit it out of the park' → 'se lució' (shone/excelled)
    - 'Rest on our laurels' → 'dormirnos en los laureles'

  ROUND-TRIP VERIFICATION
  ✅ SIMILARITY: 95%
     Meaning differences:
       - "hit it out of the park" vs "outdid themselves" - slightly
         different emphasis
     Lost nuances:
       - "pushing the envelope" (innovation) vs "keep outdoing
         ourselves" (improvement)

  QUALITY CHECK
  ✅ QUALITY SCORE: 95%
     Cultural Fit: 100% - proper Spanish idiom adaptations
```

**Lessons Learned:**
- Pattern names must include "translation" keyword to trigger agent invocation
- Translator agent doesn't have pass/fail - only verification agents do
- Input data is nested: `input.data.sourceLanguage` not `input.sourceLanguage`
- Round-trip verification catches subtle nuance shifts that quality checks miss
- Idioms need adaptation, not literal translation

**Pattern logic:**
```prism
// Verification results (roundtrip and quality agents)
verificationResults = validResults.filter(r =>
  r.result.checkType == "roundtrip" || r.result.checkType == "quality")

// Both must pass for approval
allPassed = roundtripPassed && qualityPassed

status = allPassed ? "approved"
  : failedChecks == totalChecks ? "rejected"
  : "needs_review"

output ~> avgScore
```

---

## Demo 6: Document Processing at Scale

**Status:** Not started

**Priority:** LOW - More infrastructure than orchestration demo

**What it does:**
```
Large document (100+ pages)
          ↓
    Chunking service
          ↓
┌─────┬─────┬─────┬─────┐
│  C1 │  C2 │  C3 │ ... │  ← Process in parallel
└──┬──┴──┬──┴──┬──┴──┬──┘
   └─────┴─────┴─────┘
            ↓
    Merge & deduplicate
            ↓
    Final output
```

**Value prop:** "Process large documents without writing coordination code"

**Deferred because:** This is more about batch processing infrastructure than agent orchestration. Less differentiated.

---

## Demo 7: Prompt Variant Testing

**Status:** Not started

**Priority:** LOW - Useful but niche

**What it does:**
```
Same input →
   [Agent with Prompt A]  → Output A
   [Agent with Prompt B]  → Output B
   [Agent with Prompt C]  → Output C
            ↓
   Evaluation pattern compares:
   - Output quality
   - Latency
   - Token usage
   - Cost
```

**Value prop:** "A/B test prompts systematically"

**Deferred because:** More of a dev tool than a production use case. Could be a CLI feature instead of a demo.

---

## Build Order

1. **PR Review Bot** ✅ COMPLETE - Fully tested and working
2. **Multi-Model Voting** ✅ COMPLETE - 3 Gemini models, unanimous consensus
3. **Specialized Extractors** ✅ COMPLETE - 4 parallel agents, 21 extractions from invoice
4. **RAG Quality Gate** ✅ COMPLETE - 3 parallel checkers, catches hallucinations
5. **Translation Verification** ✅ COMPLETE - Round-trip verification, idiom adaptation
6. **Doc Processing** - Defer, less differentiated
7. **Prompt Testing** - Defer, could be CLI feature

---

## Demo Requirements Checklist

For each demo to be "complete":

- [ ] README with clear explanation
- [ ] All agents implemented and working
- [ ] Prism pattern written
- [ ] run-demo.sh script
- [ ] Sample input data
- [ ] Expected output documented
- [ ] Works with and without LLM API keys (fallback mode)
- [ ] Can be demoed in < 5 minutes

### PR Review Bot Checklist: ✅ COMPLETE
- [x] README with clear explanation
- [x] All agents implemented and working (4 agents: 2 Python, 2 TypeScript)
- [x] Prism pattern written (`patterns/code-review.prism`)
- [x] run-demo.sh script
- [x] Sample input data (`examples/sample-code.ts`)
- [x] Expected output documented
- [x] Works with and without LLM API keys (pattern-based fallback)
- [x] Can be demoed in < 5 minutes

### Multi-Model Voting Checklist: ✅ COMPLETE
- [x] README with clear explanation
- [x] All agents implemented and working (3 TypeScript agents using Gemini)
- [x] Prism pattern written (`patterns/voting.prism`)
- [x] Vote CLI script (`vote.ts`)
- [x] Sample input data (`examples/content-moderation.json`, `fraud-detection.json`, `support-priority.json`)
- [x] Expected output documented
- [x] Real LLM integration with Gemini API
- [x] Can be demoed in < 5 minutes

### Specialized Extractors Checklist: ✅ COMPLETE
- [x] README with clear explanation
- [x] All agents implemented and working (4 TypeScript agents: date, amount, entity, address)
- [x] Prism pattern written (`patterns/extraction.prism`)
- [x] Extract CLI script (`extract.ts`)
- [x] Sample input data (`examples/invoice.txt`, `contract.txt`, `email.txt`)
- [x] Expected output documented
- [x] Real LLM integration with Gemini API
- [x] Can be demoed in < 5 minutes

### RAG Quality Gate Checklist: ✅ COMPLETE
- [x] README with clear explanation
- [x] All agents implemented and working (3 TypeScript agents: groundedness, relevance, completeness)
- [x] Prism pattern written (`patterns/quality-gate.prism`)
- [x] Check CLI script (`check.ts`)
- [x] Sample input data (`examples/good-response.json`, `hallucinated-response.json`, `incomplete-response.json`)
- [x] Expected output documented (all 3 scenarios: approved, needs_review for hallucinations, needs_review for incomplete)
- [x] Real LLM integration with Gemini API
- [x] Can be demoed in < 5 minutes

### Translation Verification Checklist: ✅ COMPLETE
- [x] README with clear explanation
- [x] All agents implemented and working (3 TypeScript agents: translator, roundtrip-verifier, quality-checker)
- [x] Prism pattern written (`patterns/translation.prism`)
- [x] Translate CLI script (`translate.ts`)
- [x] Sample input data (`examples/simple.json`, `technical.json`, `marketing.json`, `idioms.json`)
- [x] Expected output documented (simple text 98%, idiom-heavy text 95% with nuance notes)
- [x] Real LLM integration with Gemini API
- [x] Can be demoed in < 5 minutes
