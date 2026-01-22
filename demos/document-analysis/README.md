# Document Analysis Demo

A multi-perspective document analysis pipeline where 4 specialized agents analyze documents in parallel, each focusing on a different aspect.

## What This Demo Proves

1. **Parallel multi-perspective analysis** - 4 agents analyze simultaneously
2. **Specialized expertise** - Each agent focuses on one type of analysis
3. **Comprehensive output** - Combined results give complete document understanding
4. **Practical business value** - Useful for meeting notes, proposals, emails

## Architecture

```
Input: Document Text
              |
+-------------------------------------------------------------+
|                      Control Plane                           |
|            (Prism DocumentAnalysis Pattern)                  |
+-------------------------------------------------------------+
              |
    +---------+---------+---------+---------+
    |         |         |         |
    v         v         v         v
+---------+ +---------+ +---------+ +---------+
| Summary | |Key Points| | Action  | |Sentiment|
|  Agent  | |  Agent  | |  Items  | |  Agent  |
+---------+ +---------+ +---------+ +---------+
    |         |         |         |
    v         v         v         v
Executive   Critical   Tasks &    Tone &
Summary    Points     Decisions  Emotions
    |         |         |         |
    +---------+---------+---------+
              |
              v
+-------------------------------------------------------------+
|              Comprehensive Analysis Report                   |
|  {                                                           |
|    "summary": { topic, overview, conclusion },               |
|    "keyPoints": { critical, supporting, facts },             |
|    "actionItems": { tasks, decisions, followUps },           |
|    "sentiment": { overall, tone, concerns }                  |
|  }                                                           |
+-------------------------------------------------------------+
```

## Agents

| Agent | Purpose | Port | Output |
|-------|---------|------|--------|
| Summary Agent | Executive summary | 50600 | Topic, overview, conclusion |
| Key Points Agent | Important information | 50601 | Critical points, facts, data |
| Action Items Agent | Tasks & decisions | 50602 | Action items, deadlines, owners |
| Sentiment Agent | Tone analysis | 50603 | Sentiment, emotions, concerns |

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

### 3. Start Analysis Agents (4 terminals)

```bash
# Terminal 2 - Summary Agent
cd demos/document-analysis && pnpm agent:summary

# Terminal 3 - Key Points Agent
cd demos/document-analysis && pnpm agent:keypoints

# Terminal 4 - Action Items Agent
cd demos/document-analysis && pnpm agent:actions

# Terminal 5 - Sentiment Agent
cd demos/document-analysis && pnpm agent:sentiment
```

### 4. Analyze Documents

```bash
# Terminal 6
cd demos/document-analysis

# Meeting notes (has action items, decisions)
pnpm analyze examples/meeting-notes.txt

# Project proposal (has budget, timeline, recommendations)
pnpm analyze examples/project-proposal.txt

# Customer email (has strong sentiment, urgent requests)
pnpm analyze examples/customer-email.txt
```

## Example Output

### Meeting Notes Analysis
```
======================================================================
                    DOCUMENT ANALYSIS RESULTS
======================================================================

Document: Q4 Product Planning Meeting Summary
Type: meeting notes | Words: ~300
Analyses: 4/4 completed
Confidence: 90%

----------------------------------------------------------------------
  EXECUTIVE SUMMARY
----------------------------------------------------------------------

  Topic: The Q4 Product Planning meeting focused on finalizing the product roadmap, addressing technical debt, and ensuring successful feature launches.

  Overview: The primary discussion revolved around the new analytics dashboard, identified as the top priority, but concerns were raised about the aggressive timeline and the need to address critical authentication refactoring that impacts support tickets. Design updates are needed to improve accessibility, and QA capacity in December is limited, potentially affecting launch timelines.

  Conclusion: The team must decide whether to delay the dashboard launch to address authentication issues first or pursue parallel development, balancing feature delivery with stability and resource constraints; the decision will be informed by further stakeholder discussion and detailed estimates.

----------------------------------------------------------------------
  KEY POINTS
----------------------------------------------------------------------

  Critical Points:
    • New analytics dashboard is the top priority for Q4, but the initial timeline is too aggressive.
      Why: Meeting the demand for better data visualization tools is critical for customers, but project scope and timeline are potentially unrealistic.
    • Authentication refactoring is critical and may impact the dashboard launch timeline.
      Why: The current authentication system is causing a significant number of support tickets, and a decision is needed whether to delay the dashboard to address the technical debt.
    • Limited QA capacity in December poses a risk to launching new features.
      Why: Tom recommends avoiding launches in the last two weeks of December due to limited testing resources.

  Supporting Points:
    • Advanced filtering feature for the dashboard has been moved to Q1 next year to meet the timeline.
    • The design team needs to revise the dashboard mockups to meet WCAG accessibility standards.
    • Sarah needs to schedule a follow-up meeting to discuss the potential auth delay.

  Facts & Data:
    • 10 weeks
    • 12 weeks
    • 15%

----------------------------------------------------------------------
  ACTION ITEMS
----------------------------------------------------------------------

  ⚠️  URGENT ITEMS DETECTED

  Tasks (5 found):
    🟡 Schedule follow-up meeting with stakeholders to discuss auth delay
       Owner: Sarah | Due: Jan 20
    🟡 Create detailed estimate for parallel development approach
       Owner: Mike | Due: Jan 22
    🔴 Update mockups with accessible color palette
       Owner: Lisa | Due: Jan 17
    🟡 Document test coverage requirements for dashboard
       Owner: Tom | Due: Jan 24
    🟡 Review revised roadmap and provide feedback
       Owner: All | Due: end of week

  Decisions Needed:
    ❓ Should we delay the dashboard launch by 3 weeks to fix auth first, or run both in parallel with a smaller team?

  Follow-ups:
    ➡️  Next meeting: January 22, 2026 at 2pm

----------------------------------------------------------------------
  SENTIMENT ANALYSIS
----------------------------------------------------------------------

  Overall: 🤔 MIXED
  Score: +0.10 [+]

  Tone: formal
  Also: concerned, practical, collaborative

  Professionalism: 90%
    The document demonstrates a high level of professionalism through its structured format, clear communication of issues and action items, and collaborative problem-solving approach. Participants are identified by role, and responsibilities are clearly assigned.

  ⚠️  Concerns:
    - Timeline is aggressive with current resources
    - December testing capacity is limited
    - Auth issues could impact new feature stability
    - Potential delay of dashboard launch due to authentication issues

----------------------------------------------------------------------
  AGENT ANALYSIS DETAILS
----------------------------------------------------------------------

  ✅ Action Items Agent (actions)
     Confidence: 90%
     Found 5 action items in document

  ✅ Key Points Agent (keypoints)
     Confidence: 90%
     Extracted 7 key points from document

  ✅ Sentiment Agent (sentiment)
     Confidence: 90%
     Document sentiment: mixed (score: 0.1)

  ✅ Summary Agent (summary)
     Confidence: 90%
     Created executive summary for meeting notes

======================================================================
```

### Customer Email Analysis
```
======================================================================
                    DOCUMENT ANALYSIS RESULTS
======================================================================

Document: Customer Complaint Regarding Delayed Premium Package Order
Type: email | Words: ~320
Analyses: 4/4 completed
Confidence: 94%

----------------------------------------------------------------------
  EXECUTIVE SUMMARY
----------------------------------------------------------------------

  Topic: A long-term customer is expressing extreme dissatisfaction with a significantly delayed order and requesting immediate resolution to avoid cancellation and further negative action.

  Overview: Michael Thompson (Customer ID: CX-892341) is highly dissatisfied with the delayed delivery of his Premium Package (Order #78234), which is now 6 days overdue, causing him to lose business; he has contacted support multiple times without resolution and requests immediate delivery, a full shipping refund, and a credit for the inconvenience. He is threatening to cancel his subscription, dispute the charge, and post negative reviews if his demands are not met within 24 hours.

  Conclusion: The customer's loyalty is at risk, and immediate action is required to address the order delay, provide compensation, and prevent cancellation and negative publicity.

----------------------------------------------------------------------
  KEY POINTS
----------------------------------------------------------------------

  Critical Points:
    • Customer is extremely dissatisfied with delayed order (#78234) of the Premium Package and poor customer service.
      Why: Indicates a high risk of customer churn and negative publicity.
    • Customer is requesting immediate delivery of the order, a full refund of shipping charges, and a credit for the inconvenience.
      Why: Highlights the specific actions needed to resolve the issue and retain the customer.
    • Customer threatens to cancel subscription, dispute the charge, and leave negative reviews if the issue isn't resolved within 24 hours.
      Why: Conveys the urgency and potential consequences of inaction.

  Supporting Points:
    • Customer has been a loyal customer for three years.
    • The delayed order has negatively impacted the customer's business, costing them a client presentation.
    • Customer contacted support four times and received inconsistent information.

  Facts & Data:
    • Order #78234
    • Premium Package
    • 2 business days

----------------------------------------------------------------------
  ACTION ITEMS
----------------------------------------------------------------------

  ⚠️  URGENT ITEMS DETECTED

  Tasks (5 found):
    🔴 Deliver order #78234 today.
       Owner: Unassigned | Due: Today
    🔴 Provide a full refund of the shipping charges.
       Owner: Unassigned | Due: Within 24 hours
    🔴 Provide some kind of credit for the inconvenience.
       Owner: Unassigned | Due: Within 24 hours
    🟡 Provide a direct phone number to someone who can help with future issues.
       Owner: Unassigned | Due: Within 24 hours
    🔴 Investigate why the customer received different information on each call and why there were no notes on the account.
       Owner: Unassigned | Due: Not specified

  Decisions Needed:
    ❓ Determine the amount of credit to offer the customer.

  Follow-ups:
    ➡️  Follow up with the customer after delivery to ensure satisfaction.
    ➡️  Review customer's account history to identify patterns or recurring issues.

----------------------------------------------------------------------
  SENTIMENT ANALYSIS
----------------------------------------------------------------------

  Overall: 😟 NEGATIVE
  Score: -0.80 [----]

  Tone: urgent
  Also: frustrated, angry, demanding, disappointed

  Professionalism: 70%
    While the customer is clearly upset, they attempt to maintain a level of professionalism by clearly stating their needs and providing specific details. However, the threats slightly reduce the overall professionalism.

  ⚠️  Concerns:
    - threat of cancellation
    - threat of credit card dispute
    - threat of negative reviews

----------------------------------------------------------------------
  AGENT ANALYSIS DETAILS
----------------------------------------------------------------------

  ✅ Action Items Agent (actions)
     Confidence: 90%
     Found 5 action items in document (90% confident)

  ✅ Key Points Agent (keypoints)
     Confidence: 95%
     Extracted 6 key points from document (95% confident)

  ✅ Sentiment Agent (sentiment)
     Confidence: 95%
     Document sentiment: negative (95% confident)

  ✅ Summary Agent (summary)
     Confidence: 95%
     Created executive summary for email (95% confident)

======================================================================
```

## Use Cases

- **Meeting Notes** - Extract action items, decisions, and follow-ups
- **Project Proposals** - Summarize recommendations, identify key points
- **Customer Emails** - Detect sentiment, prioritize urgent issues
- **Reports** - Create executive summaries, extract data points
- **Contracts** - Identify key terms, obligations, deadlines

## Why This Matters

This demo shows:
1. **Specialization beats generalization** - Each agent does one thing well
2. **Parallel processing** - 4 analyses complete faster than sequential
3. **Comprehensive coverage** - Multiple perspectives catch different insights
4. **Business value** - Real documents, actionable outputs
