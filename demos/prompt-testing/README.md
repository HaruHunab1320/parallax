# Prompt A/B Testing Demo

A systematic way to compare different prompt styles and determine which works best for a given use case. Three variant agents use different prompting strategies, and a judge agent evaluates and picks the winner.

## What This Demo Proves

1. **Prompt style matters** - Same model, different prompts, different results
2. **Automated evaluation** - Judge agent compares responses objectively
3. **Parallel testing** - All variants run simultaneously
4. **Actionable insights** - Learn which style works best for different content

## Architecture

```
Input: Question/Query
              |
+-------------------------------------------------------------+
|                      Control Plane                           |
|              (Prism PromptTesting Pattern)                   |
+-------------------------------------------------------------+
              |
    +---------+---------+---------+---------+
    |         |         |         |
    v         v         v         v
+---------+ +---------+ +---------+ +---------+
| Concise | |Detailed | |Creative | |  Judge  |
|  Agent  | |  Agent  | |  Agent  | |  Agent  |
+---------+ +---------+ +---------+ +---------+
    |         |         |         |
    v         v         v         v
 Brief      Thorough  Engaging   Evaluation
Response   Response   Response    + Winner
    |         |         |         |
    +---------+---------+---------+
              |
              v
+-------------------------------------------------------------+
|                  A/B Test Results                            |
|  {                                                           |
|    "winner": "detailed",                                     |
|    "variants": { concise, detailed, creative },              |
|    "evaluations": [ scores, strengths, weaknesses ],         |
|    "recommendation": "Use detailed for educational..."       |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Prompt Style | Port | Best For |
|-------|--------------|------|----------|
| Concise Agent | Brief, to-the-point | 50700 | Mobile, quick answers, busy users |
| Detailed Agent | Thorough, structured | 50701 | Education, documentation, complex topics |
| Creative Agent | Engaging, memorable | 50702 | Marketing, storytelling, entertainment |
| Judge Agent | Evaluator | 50703 | Compares and scores all variants |

## Evaluation Criteria

The judge scores each response on:
- **Accuracy** (0-100): Is the information correct?
- **Clarity** (0-100): Is it easy to understand?
- **Engagement** (0-100): Is it interesting to read?
- **Appropriateness** (0-100): Does the style match user needs?

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
cd packages/control-plane
pnpm dev
```

Wait for: `Control Plane HTTP listening on port 8080`

### 3. Start Prompt Testing Agents (3 terminals)

```bash
# Terminal 2 - Concise Agent
cd demos/prompt-testing && pnpm agent:concise

# Terminal 3 - Detailed Agent
cd demos/prompt-testing && pnpm agent:detailed

# Terminal 4 - Creative Agent
cd demos/prompt-testing && pnpm agent:creative
```

Note: The judge agent is optional - the CLI handles evaluation inline using a two-phase approach:
1. Phase 1: Runs the 3 variant agents in parallel via the control plane
2. Phase 2: Calls Gemini directly to judge the responses

### 4. Run Tests

```bash
# Terminal 5
cd demos/prompt-testing

# Explain a concept (detailed usually wins)
pnpm test-prompts examples/explain-concept.json

# Product description (creative usually wins)
pnpm test-prompts examples/product-description.json

# How-to guide (detailed usually wins)
pnpm test-prompts examples/how-to-guide.json
```

## Example Output

### Explain Concept (Detailed Wins)
```
======================================================================
                    PROMPT A/B TEST RESULTS
======================================================================

Query: "What is machine learning and how does it work?"
Variants tested: 3

----------------------------------------------------------------------
  🏆 WINNER: DETAILED
----------------------------------------------------------------------

  The detailed response provides a comprehensive and accurate explanation
  of machine learning, including its various stages, algorithms, and
  applications. It balances clarity and depth effectively, making it the
  most suitable answer for a user seeking a thorough understanding of
  the topic.

----------------------------------------------------------------------
  VARIANT COMPARISON
----------------------------------------------------------------------

   CONCISE
   Response length: 184 chars
   Latency: 797ms
   Scores:
     Accuracy:       90%
     Clarity:        80%
     Engagement:     50%
     Appropriateness: 70%
     OVERALL:        70%
   Strengths:
     + Brief and to the point
     + Easy to quickly grasp the basic concept
   Weaknesses:
     - Lacks depth and detail
     - Not very engaging

🏆 DETAILED
   Response length: 7388 chars
   Latency: 10726ms
   Scores:
     Accuracy:       95%
     Clarity:        90%
     Engagement:     80%
     Appropriateness: 95%
     OVERALL:        90%
   Strengths:
     + Comprehensive explanation of machine learning concepts
     + Provides a clear breakdown of the process with examples
   Weaknesses:
     - Can be overwhelming for beginners
     - Lengthy and requires more time to read

   CREATIVE
   Response length: 1956 chars
   Latency: 3816ms
   Scores:
     Accuracy:       80%
     Clarity:        75%
     Engagement:     90%
     Appropriateness: 70%
     OVERALL:        75%
   Strengths:
     + Engaging and memorable analogy (puppy fetching)
     + Simplifies complex concepts
   Weaknesses:
     - Oversimplifies the process and may not be entirely accurate
     - Lacks technical depth

----------------------------------------------------------------------
  RECOMMENDATION
----------------------------------------------------------------------

  Use the concise style for a quick overview. Use the detailed style
  for in-depth learning and a thorough understanding. Use the creative
  style for introductory explanations or to engage a broader audience
  with a simplified analogy.

======================================================================
```

### Product Description (Creative Scores High on Engagement)
```
======================================================================
                    PROMPT A/B TEST RESULTS
======================================================================

Query: "Describe a smart water bottle that tracks hydration and syncs with your phone."
Variants tested: 3

----------------------------------------------------------------------
  🏆 WINNER: DETAILED
----------------------------------------------------------------------

  The detailed response provides the most complete and well-organized
  overview of a smart water bottle, balancing accuracy, clarity, and
  appropriateness for a user seeking information. While the creative
  response is more engaging, the detailed response offers more practical
  and useful information.

----------------------------------------------------------------------
  VARIANT COMPARISON
----------------------------------------------------------------------

   CONCISE
   Response length: 158 chars
   Latency: 906ms
   Scores:
     Accuracy:       90%
     Clarity:        90%
     Engagement:     60%
     Appropriateness: 85%
     OVERALL:        81%
   Strengths:
     + Direct
     + Easy to understand
   Weaknesses:
     - Lacks detail
     - Not very engaging

🏆 DETAILED
   Response length: 5291 chars
   Latency: 8646ms
   Scores:
     Accuracy:       95%
     Clarity:        85%
     Engagement:     75%
     Appropriateness: 90%
     OVERALL:        86%
   Strengths:
     + Comprehensive
     + Provides a lot of information
   Weaknesses:
     - Can be overwhelming
     - Less engaging than the creative response

   CREATIVE
   Response length: 1485 chars
   Latency: 3378ms
   Scores:
     Accuracy:       80%
     Clarity:        80%
     Engagement:     95%
     Appropriateness: 70%
     OVERALL:        81%
   Strengths:
     + Highly engaging
     + Imaginative
   Weaknesses:
     - Less focus on specific details
     - Not as factual

----------------------------------------------------------------------
  RECOMMENDATION
----------------------------------------------------------------------

  Use the concise style for quick summaries or elevator pitches. Use the
  detailed style for comprehensive guides or product descriptions. Use
  the creative style for marketing materials or presentations where
  engagement is key, but be mindful of accuracy and clarity.

======================================================================
```

## Use Cases

- **Documentation teams** - Find the right tone for different doc types
- **Marketing** - Test which style resonates for product descriptions
- **Education** - Determine best explanation style for different topics
- **Chatbots** - Optimize response style for your audience
- **A/B testing** - Systematically compare prompt engineering approaches

## Why This Matters

This demo shows:
1. **Prompt engineering is testable** - Don't guess, measure
2. **Different styles for different needs** - No one-size-fits-all
3. **Automated evaluation** - Scale testing without manual review
4. **Data-driven decisions** - Choose prompts based on evidence
