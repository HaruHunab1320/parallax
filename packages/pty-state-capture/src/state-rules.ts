import type { StateKind, StateRule } from './types';

function byPriorityDescending(a: StateRule, b: StateRule): number {
  return (b.priority ?? 0) - (a.priority ?? 0);
}

export const DEFAULT_STATE_RULES: StateRule[] = [
  {
    id: 'awaiting_input_claude_interrupted',
    kind: 'awaiting_input',
    pattern: /interrupted\s*·\s*what should claude do instead\?/i,
    priority: 115,
    source: 'claude',
  },
  {
    id: 'awaiting_approval_claude_menu',
    kind: 'awaiting_approval',
    pattern:
      /do you want to proceed\?.*(?:1\.\s*yes|2\.\s*yes,?\s*and\s*don.?t\s*ask\s*again)|yes,?\s*and\s*don.?t\s*ask\s*again/i,
    priority: 112,
    source: 'claude',
  },
  {
    id: 'awaiting_approval_codex',
    kind: 'awaiting_approval',
    pattern:
      /would.?you.?like.?to.?run.?the.?following.?command|would.?you.?like.?to.?make.?the.?following.?edits|approve.?access/i,
    priority: 100,
    source: 'codex',
  },
  {
    id: 'awaiting_approval_gemini',
    kind: 'awaiting_approval',
    pattern:
      /apply.?this.?change|allow.?execution|allow.?execution.?of.?mcp.?tool|do.?you.?want.?to.?proceed/i,
    priority: 95,
    source: 'gemini',
  },
  {
    id: 'awaiting_auth_gemini',
    kind: 'awaiting_auth',
    pattern:
      /get.?started.*authenticate.?for.?this.?project|waiting.?for.?auth|enter.?gemini.?api.?key/i,
    priority: 90,
    source: 'gemini',
  },
  {
    id: 'awaiting_auth_codex',
    kind: 'awaiting_auth',
    pattern:
      /sign.?in.?with.?chatgpt|sign.?in.?with.?device.?code|provide.?your.?own.?api.?key|finish.?signing.?in.?via.?your.?browser|device.?code/i,
    priority: 90,
    source: 'codex',
  },
  {
    id: 'busy_plan_mode_claude',
    kind: 'busy_streaming',
    pattern:
      /plan mode on|entered plan mode|now exploring and designing|ctrl\+b to run in background|\b(?:[a-z][a-z-]{4,}ing…)\b|\b\d+m?\s*\d*s?\s*·\s*↓\s*\d+(?:\.\d+)?k?\s*tokens\b/i,
    priority: 88,
    source: 'claude',
  },
  {
    id: 'awaiting_input_shell_wait',
    kind: 'awaiting_input',
    pattern:
      /interactive.?shell.?awaiting.?input|press.?tab.?to.?focus.?shell/i,
    priority: 85,
    source: 'gemini',
  },
  {
    id: 'awaiting_input_shell_confirm_gemini',
    kind: 'awaiting_input',
    pattern:
      /do.?you.?want.?to.?continue.?\([yY]\/[nN]\)|continue\?.?\([yY]\/[nN]\)|are.?you.?sure\?.?\([yY]\/[nN]\)/i,
    priority: 96,
    source: 'gemini',
  },
  {
    id: 'awaiting_input_checkpoint_gemini',
    kind: 'awaiting_input',
    pattern:
      /enable.?checkpointing.?to.?recover.?your.?session.?after.?a.?crash/i,
    priority: 84,
    source: 'gemini',
  },
  {
    id: 'busy_status_line',
    kind: 'busy_streaming',
    pattern:
      /esc.?to.?interrupt|esc.?to.?cancel|waiting.?for.?background.?terminal|booting.?mcp/i,
    priority: 80,
  },
  {
    id: 'ready_prompt_gemini_after_cancel',
    kind: 'ready_for_input',
    pattern:
      /request.?cancelled.*(?:type.?your.?message|@path\/to\/file)|press.?ctrl\+c.?again.?to.?exit.*(?:type.?your.?message|@path\/to\/file)/i,
    priority: 82,
    source: 'gemini',
  },
  {
    id: 'ready_prompt_claude',
    kind: 'ready_for_input',
    pattern:
      /(?:^|\s)(?:❯|›)\s*(?:try\s*"[^"]*")?\s*(?:\?\s*for shortcuts)?\s*$/im,
    priority: 76,
    source: 'claude',
  },
  {
    id: 'ready_prompt_codex',
    kind: 'ready_for_input',
    pattern:
      /(?:^|\s)›\s+.+|ask.?codex.?to.?do.?anything|explain.?this.?codebase|summarize.?recent.?commits/i,
    priority: 70,
    source: 'codex',
  },
  {
    id: 'ready_prompt_gemini',
    kind: 'ready_for_input',
    pattern: /type.?your.?message.?or.?@path\/to\/file|\(r:\)|^\s*[>!*]\s+/im,
    priority: 65,
    source: 'gemini',
  },
  {
    id: 'completed_claude_duration',
    kind: 'completed',
    pattern: /cooked.?for.?\d+(?:h\s+\d+m\s+\d+s|m\s+\d+s|s)/i,
    priority: 60,
    source: 'claude',
  },
];

export function mergeRules(userRules: StateRule[] | undefined): StateRule[] {
  const merged = [...DEFAULT_STATE_RULES, ...(userRules ?? [])];
  return merged.sort(byPriorityDescending);
}

export function classifyState(
  normalizedTail: string,
  rules: StateRule[],
  source?: string
): { kind: StateKind; ruleId?: string; confidence: number } {
  if (normalizedTail.length === 0) {
    return { kind: 'unknown', confidence: 0.1 };
  }

  // Prefer recent terminal output so stale markers (for example:
  // "Cooked for 41s" from an earlier turn) do not keep re-triggering.
  const recentTail = normalizedTail.slice(-4000);
  const matches: Array<{ rule: StateRule; index: number }> = [];
  for (const rule of rules) {
    // Source-scoped rules only apply to their matching adapter type.
    if (rule.source && source && rule.source !== source) {
      continue;
    }
    const safeFlags = rule.pattern.flags.replace(/g/g, '');
    const safe = new RegExp(rule.pattern.source, safeFlags);
    const index = recentTail.search(safe);
    if (index >= 0) {
      matches.push({ rule, index });
    }
  }

  if (matches.length > 0) {
    if (
      source === 'gemini' &&
      /request.?cancelled.*(?:type.?your.?message|@path\/to\/file)|press.?ctrl\+c.?again.?to.?exit.*(?:type.?your.?message|@path\/to\/file)/i.test(
        recentTail
      )
    ) {
      return {
        kind: 'ready_for_input',
        ruleId: 'ready_prompt_gemini_after_cancel',
        confidence: 0.83,
      };
    }

    matches.sort((a, b) => {
      if (a.index !== b.index) {
        return b.index - a.index;
      }
      return (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
    });

    let topMatch = matches[0];

    // Gemini often keeps the composer prompt visible while overlays are active.
    // Avoid classifying as ready if recent output still contains stronger
    // waiting/busy markers (approval, shell wait, active loading).
    if (source === 'gemini' && topMatch.rule.kind === 'ready_for_input') {
      if (topMatch.rule.id === 'ready_prompt_gemini_after_cancel') {
        const top = topMatch.rule;
        return {
          kind: top.kind,
          ruleId: top.id,
          confidence: 0.75 + Math.min((top.priority ?? 0) / 1000, 0.2),
        };
      }

      const recentWindowStart = Math.max(0, recentTail.length - 1600);
      const overrideKinds: StateKind[] = [
        'awaiting_input',
        'awaiting_approval',
        'busy_streaming',
        'awaiting_auth',
      ];
      const conflicts = matches.filter(({ rule, index }) => {
        return overrideKinds.includes(rule.kind) && index >= recentWindowStart;
      });

      if (conflicts.length > 0) {
        const hasBusyCancellation =
          conflicts.some(({ rule }) => rule.id === 'busy_status_line') &&
          /esc.{0,20}to.{0,20}cancel/i.test(recentTail) &&
          !/request.?cancelled/i.test(recentTail);
        if (hasBusyCancellation) {
          const busy = conflicts.find(
            ({ rule }) => rule.id === 'busy_status_line'
          );
          if (busy) {
            topMatch = busy;
          }
        }

        conflicts.sort((a, b) => {
          const pa = a.rule.priority ?? 0;
          const pb = b.rule.priority ?? 0;
          if (pa !== pb) return pb - pa;
          return b.index - a.index;
        });
        if (!(hasBusyCancellation && topMatch.rule.id === 'busy_status_line')) {
          topMatch = conflicts[0];
        }
      }
    }

    const top = topMatch.rule;
    return {
      kind: top.kind,
      ruleId: top.id,
      confidence: 0.75 + Math.min((top.priority ?? 0) / 1000, 0.2),
    };
  }

  return { kind: 'unknown', confidence: 0.2 };
}
