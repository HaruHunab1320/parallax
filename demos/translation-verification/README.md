# Translation Verification Demo

A translation quality assurance pipeline that uses round-trip translation to verify that meaning is preserved, plus additional quality checks for fluency and naturalness.

## What This Demo Proves

1. **Round-trip verification** - Translate forward, then back, and compare to catch meaning loss
2. **Quality assessment** - Evaluate fluency, grammar, style, and cultural fit
3. **Parallel verification** - Multiple quality checks run simultaneously
4. **Automatic QA decisions** - Approve good translations, flag problematic ones for human review

## Architecture

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
    |         |         |
    +---------+---------+
              |
              v
+-------------------------------------------------------------+
|                  Translation Result                          |
|  {                                                           |
|    "status": "approved" | "needs_review" | "rejected",       |
|    "translation": "...",                                     |
|    "scores": { roundtrip, quality },                         |
|    "recommendation": "Use translation" | "Flag for review"  |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Purpose | Port | What It Checks |
|-------|---------|------|----------------|
| Translator | Primary translation | 50500 | Produces the translation to use |
| Round-Trip Verifier | Meaning preservation | 50501 | Translates back to source, compares similarity |
| Quality Checker | Fluency & naturalness | 50502 | Grammar, style, cultural fit |

## Verification Outcomes

| Status | Meaning | Action |
|--------|---------|--------|
| **approved** | Both checks pass (>85% similarity, >75% quality) | Use translation |
| **needs_review** | One check fails | Flag for human translator |
| **rejected** | Both checks fail | Reject, retranslate |

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

### 3. Start Translation Agents (3 terminals)

```bash
# Terminal 2 - Translator
cd demos/translation-verification
pnpm agent:translator

# Terminal 3 - Round-Trip Verifier
cd demos/translation-verification
pnpm agent:roundtrip

# Terminal 4 - Quality Checker
cd demos/translation-verification
pnpm agent:quality
```

### 4. Run Translations

```bash
# Terminal 5
cd demos/translation-verification

# Simple greeting (should pass easily)
pnpm translate examples/simple.json

# Technical documentation
pnpm translate examples/technical.json

# Marketing copy (persuasive language)
pnpm translate examples/marketing.json

# Idioms and expressions (challenging for translation)
pnpm translate examples/idioms.json
```

## Example Output

### Simple Text (Approved)
```
======================================================================
                    TRANSLATION RESULTS
======================================================================

Original: "Hello! Welcome to our company. We are very happy to have you..."
Direction: English -> Spanish

Status: APPROVED
Overall Score: 95%
Checks: 3/3 passed

Translation verified - round-trip similarity and quality checks passed

----------------------------------------------------------------------
  TRANSLATION
----------------------------------------------------------------------

  Hola! Bienvenido a nuestra empresa. Estamos muy contentos de
  tenerle aqui. Nuestro equipo esta dedicado a proporcionar un
  excelente servicio y soporte...

----------------------------------------------------------------------
  ROUND-TRIP VERIFICATION
----------------------------------------------------------------------

  SIMILARITY: 96%
     Does the translation preserve meaning when translated back?

     Back-translation: "Hello! Welcome to our company. We are very
     happy to have you here..."

     Meaning fully preserved through round-trip

----------------------------------------------------------------------
  QUALITY CHECK
----------------------------------------------------------------------

  QUALITY SCORE: 94%
     Is the translation fluent and natural?

     Breakdown:
       Fluency:      95%
       Grammar:      98%
       Style:        92%
       Completeness: 100%
       Cultural Fit: 90%

     Strengths:
       + Natural, fluent Spanish phrasing
       + Appropriate formal register maintained
       + All information accurately conveyed

----------------------------------------------------------------------
  RECOMMENDATION
----------------------------------------------------------------------
  Use translation - quality verified

======================================================================
```

### Idiom-Heavy Text (Needs Review)
```
Status: NEEDS_REVIEW
Overall Score: 72%
Checks: 1/3 passed

  ROUND-TRIP VERIFICATION

  SIMILARITY: 68%
     Meaning differences:
       - "burning the midnight oil" -> "working late" loses the
         metaphorical imagery
       - "hit it out of the park" -> "did very well" loses the
         baseball reference
       - "pushing the envelope" -> "innovating" is accurate but
         less idiomatic

     Lost nuances:
       - Sports metaphors not equivalent in Spanish
       - Informal tone partially lost

  RECOMMENDATION
  Flag for human translator review
```

## The Round-Trip Verification Technique

Round-trip translation is a powerful QA technique:

1. **Translate forward**: English -> Spanish
2. **Translate back**: Spanish -> English
3. **Compare**: Original English vs. Back-translated English

If the meaning is preserved, the back-translation should be semantically similar to the original. Low similarity indicates:
- **Ambiguous original text** - Multiple interpretations possible
- **Cultural concepts** - Ideas that don't translate directly
- **Idioms/expressions** - Figurative language that needs adaptation
- **Translation errors** - Incorrect word choices or grammar

## Why This Matters

Use cases:
- **Product localization** - Verify marketing copy preserves impact
- **Documentation translation** - Ensure technical accuracy
- **Legal translation** - Critical for contracts and compliance
- **Customer support** - Maintain tone and helpfulness

Benefits:
- **Automated QA** - Catch issues before human review
- **Prioritized review** - Humans focus on flagged translations
- **Consistent quality** - Same standards applied to all content
- **Fast feedback** - Know immediately if a translation needs work
