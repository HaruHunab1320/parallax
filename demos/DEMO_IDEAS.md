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

## Demo 2: Multi-Model Voting

**Status:** Not started

**Priority:** HIGH - Simple, obviously useful

**What it does:**
```
Input: A question or decision that needs high confidence

┌─────────┐  ┌─────────┐  ┌─────────┐
│  GPT-4  │  │ Claude  │  │ Gemini  │
└────┬────┘  └────┬────┘  └────┬────┘
     └───────────┼───────────┘
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

**Agents needed:**
- GPT-4 Agent (TypeScript) - calls OpenAI
- Claude Agent (Python) - calls Anthropic
- Gemini Agent (TypeScript) - calls Google

**Pattern logic:**
```prism
results = agentResults
votes = results.map(r => r.result.decision)
unanimous = votes.every(v => v === votes[0])
majority = mostCommon(votes)

if (unanimous) {
  output = { decision: votes[0], confidence: "high", consensus: "unanimous" }
} else if (countOf(majority) >= 2) {
  output = { decision: majority, confidence: "moderate", consensus: "majority" }
} else {
  output = { decision: null, confidence: "low", consensus: "none", needsHuman: true }
}
```

---

## Demo 3: Specialized Extractors Pipeline

**Status:** Not started

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

**Agents needed:**
- Date Extractor (Python) - finds and normalizes dates
- Amount Extractor (Python) - finds currency amounts
- Entity Extractor (TypeScript) - names, organizations
- Address Extractor (TypeScript) - physical addresses

**Why Parallax helps:**
- Each agent can be a small, fast, cheap model
- Easy to add new extractors without changing others
- Pattern handles merging and deduplication

---

## Demo 4: RAG Quality Gate

**Status:** Not started

**Priority:** MEDIUM - Solves real hallucination problem

**What it does:**
```
RAG Pipeline:
  Query → Retrieve → Generate
                        ↓
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
   ┌───────────┐  ┌───────────┐  ┌───────────┐
   │Groundedness│  │ Relevance │  │Completeness│
   │  Checker  │  │  Checker  │  │  Checker  │
   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
         └──────────────┼──────────────┘
                        ▼
              Pass → Return to user
              Fail → Retry or escalate
```

**Value prop:** "Catch hallucinations before users see them"

**Use cases:**
- Customer support chatbots
- Documentation Q&A
- Legal research assistants
- Medical information systems

**Agents needed:**
- Groundedness Agent - Is the answer supported by the retrieved docs?
- Relevance Agent - Does the answer address the question?
- Completeness Agent - Are all parts of the question answered?

**Pattern logic:**
```prism
checks = agentResults
allPassed = checks.every(c => c.result.passed)
failedChecks = checks.filter(c => !c.result.passed)

if (allPassed) {
  output = { status: "approved", answer: input.generatedAnswer }
} else {
  output = {
    status: "rejected",
    reasons: failedChecks.map(c => c.result.reason),
    action: "retry_with_different_retrieval"
  }
}
```

---

## Demo 5: Translation Verification Loop

**Status:** Not started

**Priority:** MEDIUM - Clear value for localization

**What it does:**
```
English text
     ↓
[Translator Agent] → Spanish
                        ↓
              [Back-Translator Agent] → English'
                                          ↓
                              [Comparator Agent]
                                          ↓
                              Similarity score
                              If < 0.85 → flag for human
```

**Value prop:** "Automatic QA for translations"

**Use cases:**
- Product localization
- Documentation translation
- Marketing content
- Legal document translation

**Agents needed:**
- Forward Translator (Python) - translates to target language
- Back Translator (TypeScript) - translates back to source
- Semantic Comparator (Python) - compares original vs back-translated

**Pattern logic:**
```prism
original = input.text
translated = translatorResult.result.text
backTranslated = backTranslatorResult.result.text
similarity = comparatorResult.result.score

if (similarity > 0.85) {
  output = { status: "approved", translation: translated }
} else {
  output = {
    status: "needs_review",
    translation: translated,
    similarity: similarity,
    backTranslation: backTranslated
  }
}
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
2. **Multi-Model Voting** - Next priority, simple and compelling
3. **Specialized Extractors** - Very practical, good for enterprise story
4. **RAG Quality Gate** - Solves real problem, good for AI safety angle
5. **Translation Verification** - Clear value, niche audience
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
