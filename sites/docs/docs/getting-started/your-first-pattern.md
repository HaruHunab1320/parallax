---
sidebar_position: 4
title: Your First Pattern
---

# Your First Pattern

Build a complete multi-agent pattern from scratch.

## What We'll Build

A **document analysis pattern** that:
1. Takes a document as input
2. Sends it to 3 analysis agents in parallel
3. Builds consensus from their results
4. Filters by confidence threshold
5. Returns the agreed-upon analysis

## Step 1: Define the Pattern

```yaml title="document-analysis.yaml"
name: document-analysis
version: 1.0.0
description: Multi-agent document analysis with consensus

input:
  document: string
  analysisType:
    type: string
    default: "general"

agents:
  capabilities: [document-analysis]
  min: 3
  max: 5

execution:
  strategy: parallel
  timeout: 60000

aggregation:
  strategy: consensus
  threshold: 0.75
  minVotes: 2

validation:
  minConfidence: 0.7
  onFailure: retry

output:
  analysis: $consensus.result
  confidence: $consensus.confidence
  agentCount: $execution.agentCount
```

## Step 2: Create an Analysis Agent

```typescript title="analysis-agent.ts"
import { ParallaxAgent } from '@parallax/sdk-typescript';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const agent = new ParallaxAgent({
  name: 'claude-analyzer',
  capabilities: ['document-analysis'],
  controlPlaneUrl: 'http://localhost:8080',
});

agent.onTask(async (task) => {
  const { document, analysisType } = task.input;

  const response = await anthropic.messages.create({
    model: 'claude-3-sonnet-20240229',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Analyze this document for ${analysisType} insights:\n\n${document}`
    }]
  });

  return {
    result: {
      summary: response.content[0].text,
      keyPoints: extractKeyPoints(response.content[0].text),
      sentiment: detectSentiment(response.content[0].text),
    },
    confidence: 0.85,
  };
});

agent.start();
console.log('Analysis agent started');
```

## Step 3: Execute the Pattern

```typescript title="run-analysis.ts"
import { ParallaxClient } from '@parallax/sdk-typescript';
import fs from 'fs';

const client = new ParallaxClient({
  controlPlaneUrl: 'http://localhost:8080',
});

const document = fs.readFileSync('quarterly-report.txt', 'utf-8');

const result = await client.executePattern('document-analysis', {
  document,
  analysisType: 'financial',
});

console.log('Analysis complete!');
console.log('Confidence:', result.confidence);
console.log('Summary:', result.analysis.summary);
console.log('Key Points:', result.analysis.keyPoints);
```

## Step 4: Run It

```bash
# Start 3 agent instances
npx tsx analysis-agent.ts &
npx tsx analysis-agent.ts &
npx tsx analysis-agent.ts &

# Execute the pattern
npx tsx run-analysis.ts
```

## Understanding the Output

```json
{
  "analysis": {
    "summary": "Q4 showed 15% revenue growth...",
    "keyPoints": [
      "Revenue increased 15% YoY",
      "Operating margins improved to 23%",
      "New product line exceeded targets"
    ],
    "sentiment": "positive"
  },
  "confidence": 0.89,
  "agentCount": 3,
  "consensusReached": true
}
```

The 89% confidence means 3 agents largely agreed on the analysis, weighted by their individual confidence scores.

## Next Steps

- [Pattern Syntax](/patterns/yaml-syntax) - Learn all pattern options
- [Voting Patterns](/patterns/voting-patterns) - For classification tasks
- [Quality Gates](/patterns/quality-gates) - Add confidence thresholds
