import { cf, uncertain } from '@parallaxai/confidence';
import type { PatternAgentInfo, PatternModule } from '../types';

interface RoutingDecision {
  routingStrategy: string;
  selectedAgent: PatternAgentInfo | null;
  reason: string;
}

/** Converted from patterns/uncertainty-router.prism (v1.0.0). */
export const uncertaintyRouter: PatternModule = {
  meta: {
    name: 'UncertaintyRouter',
    version: '2.0.0',
    description:
      "Route tasks based on uncertainty levels using Prism's uncertain conditionals",
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          taskContext: { type: 'object' },
        },
      },
    },
    capabilities: ['code-analysis'],
  },

  async execute(ctx) {
    // The first agent's result is the quick uncertainty assessment
    const assessmentResult = ctx.results[0];
    const assessmentConfidence = assessmentResult
      ? assessmentResult.confidence
      : 0.5;

    const agentCount = ctx.agents.length;

    // Prism `uncertain if (true ~> assessmentConfidence)` with default
    // bounds { high: 0.8, medium: 0.5 }
    const routing = uncertain<boolean, RoutingDecision>(
      cf(true, assessmentConfidence),
      {
        high: () => ({
          // High confidence (>= 80%): Can use generalist
          routingStrategy: 'generalist_sufficient',
          reason: 'High confidence - generalist can handle',
          selectedAgent: agentCount >= 3 ? ctx.agents[2]! : null,
        }),
        medium: () => ({
          // Medium confidence (50-80%): Use balanced approach
          routingStrategy: 'balanced_approach',
          reason: 'Moderate confidence - using balanced agent',
          selectedAgent: agentCount >= 2 ? ctx.agents[1]! : null,
        }),
        low: () => ({
          // Low confidence (< 50%): Use most experienced agent
          // (assuming agents are sorted by expertise)
          routingStrategy: 'specialist_required',
          reason: 'Low confidence detected - routing to specialist',
          selectedAgent: agentCount >= 1 ? ctx.agents[0]! : null,
        }),
      }
    ).value;

    const routingStrategy = routing.routingStrategy;
    let selectedAgent = routing.selectedAgent;
    let reason = routing.reason;

    // Fallback if no agent selected
    if (!selectedAgent && agentCount > 0) {
      selectedAgent = ctx.agents[0]!;
      reason = reason + ' (fallback to first available)';
    }

    // The original noted real execution would call the selected agent here;
    // it built a routing record from the pre-processed assessment instead.
    let taskResult: {
      status: string;
      agentName: string;
      strategy: string;
    } | null = null;
    let resultConfidence = 0;

    if (selectedAgent) {
      taskResult = {
        status: 'routed',
        agentName: selectedAgent.name,
        strategy: routingStrategy,
      };
      resultConfidence = assessmentConfidence;
    }

    const result = {
      routingStrategy,
      selectedAgent: selectedAgent ? selectedAgent.name : 'none',
      reason,
      assessmentConfidence,
      taskResult,
      uncertaintyHandling:
        assessmentConfidence < 0.5
          ? 'Applied uncertainty-aware routing'
          : 'Standard routing applied',
    };

    return cf(result, resultConfidence);
  },
};
