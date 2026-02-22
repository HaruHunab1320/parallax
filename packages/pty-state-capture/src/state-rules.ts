import type { StateKind, StateRule } from './types';

function byPriorityDescending(a: StateRule, b: StateRule): number {
  return (b.priority ?? 0) - (a.priority ?? 0);
}

export const DEFAULT_STATE_RULES: StateRule[] = [
  {
    id: 'awaiting_approval_codex',
    kind: 'awaiting_approval',
    pattern: /would.?you.?like.?to.?run.?the.?following.?command|would.?you.?like.?to.?make.?the.?following.?edits|approve.?access/i,
    priority: 100,
    source: 'codex',
  },
  {
    id: 'awaiting_approval_gemini',
    kind: 'awaiting_approval',
    pattern: /apply.?this.?change|allow.?execution|allow.?execution.?of.?mcp.?tool|do.?you.?want.?to.?proceed/i,
    priority: 95,
    source: 'gemini',
  },
  {
    id: 'awaiting_auth_gemini',
    kind: 'awaiting_auth',
    pattern: /get.?started.*authenticate.?for.?this.?project|waiting.?for.?auth|enter.?gemini.?api.?key/i,
    priority: 90,
    source: 'gemini',
  },
  {
    id: 'awaiting_auth_codex',
    kind: 'awaiting_auth',
    pattern: /sign.?in.?with.?chatgpt|sign.?in.?with.?device.?code|provide.?your.?own.?api.?key|finish.?signing.?in.?via.?your.?browser|device.?code/i,
    priority: 90,
    source: 'codex',
  },
  {
    id: 'awaiting_input_shell_wait',
    kind: 'awaiting_input',
    pattern: /interactive.?shell.?awaiting.?input|press.?tab.?to.?focus.?shell/i,
    priority: 85,
    source: 'gemini',
  },
  {
    id: 'busy_status_line',
    kind: 'busy_streaming',
    pattern: /esc.?to.?interrupt|esc.?to.?cancel|waiting.?for.?background.?terminal|booting.?mcp/i,
    priority: 80,
  },
  {
    id: 'ready_prompt_codex',
    kind: 'ready_for_input',
    pattern: /(?:^|\s)›\s+.+|ask.?codex.?to.?do.?anything|explain.?this.?codebase|summarize.?recent.?commits/i,
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
): { kind: StateKind; ruleId?: string; confidence: number } {
  if (normalizedTail.length === 0) {
    return { kind: 'unknown', confidence: 0.1 };
  }

  const matches: Array<{ rule: StateRule; index: number }> = [];
  for (const rule of rules) {
    const safeFlags = rule.pattern.flags.replace(/g/g, '');
    const safe = new RegExp(rule.pattern.source, safeFlags);
    const index = normalizedTail.search(safe);
    if (index >= 0) {
      matches.push({ rule, index });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => {
      if (a.index !== b.index) {
        return b.index - a.index;
      }
      return (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
    });

    const top = matches[0].rule;
    return {
      kind: top.kind,
      ruleId: top.id,
      confidence: 0.75 + Math.min((top.priority ?? 0) / 1000, 0.2),
    };
  }

  return { kind: 'unknown', confidence: 0.2 };
}
