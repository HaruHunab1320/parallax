/**
 * Claude Code CLI Adapter
 *
 * Adapter for the Claude Code CLI (claude command).
 */

import type {
  AutoResponseRule,
  BlockingPromptDetection,
  LoginDetection,
  ParsedOutput,
  SpawnConfig,
  ToolRunningInfo,
} from 'adapter-types';
import {
  type AgentCredentials,
  type AgentFileDescriptor,
  BaseCodingAdapter,
  type InstallationInfo,
  type ModelRecommendations,
} from './base-coding-adapter';

const CLAUDE_HOOK_MARKER_PREFIX = 'PARALLAX_CLAUDE_HOOK';

/**
 * All 8 turn-completion verbs from Claude Code source.
 * Randomly selected by the TUI when a turn finishes.
 */
const TURN_COMPLETION_VERBS = [
  'Baked',
  'Brewed',
  'Churned',
  'Cogitated',
  'Cooked',
  'Crunched',
  'Sautéed',
  'Worked',
] as const;

/** Turn duration pattern matching all known completion verbs */
const TURN_DURATION_RE = new RegExp(
  `(?:${TURN_COMPLETION_VERBS.join('|')})\\s+for\\s+\\d+(?:h\\s+\\d{1,2}m\\s+\\d{1,2}s|m\\s+\\d{1,2}s|s)`
);

/**
 * Sample of the 204 spinner verbs from Claude Code source.
 * Used to detect loading state from spinner text like "Cogitating…"
 */
const SPINNER_VERB_RE =
  /(?:Accomplishing|Architecting|Baking|Brewing|Calculating|Churning|Clauding|Cogitating|Computing|Concocting|Cooking|Crafting|Creating|Crunching|Deliberating|Determining|Doing|Fermenting|Forging|Generating|Imagining|Incubating|Inferring|Kneading|Manifesting|Mulling|Musing|Percolating|Pondering|Processing|Ruminating|Sautéing|Simmering|Synthesizing|Thinking|Tinkering|Vibing|Working|Wrangling)(?:…|\.{3})/;

interface ClaudeHookMarker {
  event: string;
  notification_type?: string;
  tool_name?: string;
  message?: string;
}

interface ClaudeAdapterConfig {
  continue?: boolean;
  resume?: string;
  claudeHookTelemetry?: boolean;
  claudeHookMarkerPrefix?: string;
  /** Use --bare mode for lightweight automation (skips hooks, LSP, plugins, CLAUDE.md) */
  bare?: boolean;
  /** Maximum agentic turns (--print mode only) */
  maxTurns?: number;
  /** Maximum API spend in USD (--print mode only) */
  maxBudgetUsd?: number;
  /** Permission mode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk' */
  permissionMode?: string;
}

export class ClaudeAdapter extends BaseCodingAdapter {
  readonly adapterType = 'claude';
  readonly displayName = 'Claude Code';

  /** Heaviest TUI — status bar, shortcuts, update notices, /ide suggestions.
   *  3000ms needed because detectReady fires early during boot rendering. */
  override readonly readySettleMs: number = 3000;

  readonly installation: InstallationInfo = {
    command: 'npm install -g @anthropic-ai/claude-code',
    alternatives: [
      'npx @anthropic-ai/claude-code (run without installing)',
      'brew install claude-code (macOS with Homebrew)',
    ],
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    minVersion: '1.0.0',
  };

  /**
   * Auto-response rules for Claude Code CLI.
   * These handle common text-based [y/n] prompts that can be safely auto-responded.
   * Explicit responseType: 'text' prevents the usesTuiMenus default from kicking in.
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern:
        /choose\s+the\s+text\s+style\s+that\s+looks\s+best\s+with\s+your\s+terminal|syntax\s+theme:/i,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept Claude first-run theme/style prompt',
      safe: true,
      once: true,
    },
    {
      pattern:
        /trust.*(?:folder|directory)|safety.?check|project.you.created|(?:Yes|Allow).*(?:No|Deny).*(?:Enter|Return)/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept trust prompt for working directory',
      safe: true,
      once: true,
    },
    {
      pattern:
        /wants? (?:your )?permission|needs your permission|(?:Allow|Approve)\s[\s\S]{0,50}(?:Deny|Don't allow)/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description:
        'Auto-approve tool permission prompts (file access, MCP tools, etc.)',
      safe: true,
      once: true,
    },
    {
      pattern: /update available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      responseType: 'text',
      description: 'Decline Claude Code update to continue execution',
      safe: true,
    },
    {
      pattern: /new version.*available.*\[y\/n\]/i,
      type: 'update',
      response: 'n',
      responseType: 'text',
      description: 'Decline version upgrade prompt',
      safe: true,
    },
    {
      pattern: /would you like to enable.*telemetry.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline telemetry prompt',
      safe: true,
    },
    {
      pattern: /send anonymous usage data.*\[y\/n\]/i,
      type: 'config',
      response: 'n',
      responseType: 'text',
      description: 'Decline anonymous usage data',
      safe: true,
    },
    {
      pattern:
        /how is claude doing this session\?\s*\(optional\)|1:\s*bad\s+2:\s*fine\s+3:\s*good\s+0:\s*dismiss/i,
      type: 'config',
      response: '0',
      responseType: 'text',
      description: 'Dismiss optional Claude session survey',
      safe: true,
      once: true,
    },
    {
      pattern: /continue without.*\[y\/n\]/i,
      type: 'config',
      response: 'y',
      responseType: 'text',
      description: 'Continue without optional feature',
      safe: true,
    },
    // From leaked source: exact "Do you want to proceed?" permission text
    {
      pattern: /Do you want to proceed\?/,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept Claude "Do you want to proceed?" permission dialog',
      safe: true,
      once: true,
    },
    // From leaked source: file edit permission dialog
    {
      pattern: /Do you want to make this edit to/,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Accept Claude file edit permission',
      safe: true,
      once: true,
    },
    // From leaked source: context limit / compact prompt
    {
      pattern:
        /Context limit reached|\/compact or \/clear to continue/i,
      type: 'config',
      response: '/compact',
      responseType: 'text',
      description:
        'Auto-compact when context limit reached to continue execution',
      safe: true,
    },
    // From leaked source: exit confirmation
    {
      pattern: /Press .{1,10} again to exit/,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['escape'],
      description: 'Cancel accidental exit confirmation',
      safe: true,
      once: true,
    },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'CLAUDE.md',
        description: 'Project-level instructions read automatically on startup',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.claude/settings.json',
        description: 'Project-scoped settings (allowed tools, permissions)',
        autoLoaded: true,
        type: 'config',
        format: 'json',
      },
      {
        relativePath: '.claude/commands',
        description: 'Custom slash commands directory',
        autoLoaded: false,
        type: 'config',
        format: 'markdown',
      },
    ];
  }

  getRecommendedModels(_credentials?: AgentCredentials): ModelRecommendations {
    return {
      powerful: 'claude-sonnet-4-20250514',
      fast: 'claude-haiku-4-5-20251001',
    };
  }

  getCommand(): string {
    return 'claude';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];
    const adapterConfig = config.adapterConfig as
      | ClaudeAdapterConfig
      | undefined;

    // Print mode for non-interactive usage (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--print');

      // Set working directory in non-interactive mode
      // In interactive/PTY mode, the PTY's cwd is already set by spawn config
      if (config.workdir) {
        args.push('--cwd', config.workdir);
      }
    }

    // Bare mode: lightweight automation — skips hooks, LSP, plugins, CLAUDE.md
    if (adapterConfig?.bare) {
      args.push('--bare');
    }

    // Pass-through resume flags for interactive sessions
    if (adapterConfig?.resume) {
      args.push('--resume', adapterConfig.resume);
    } else if (adapterConfig?.continue) {
      args.push('--continue');
    }

    // Permission mode override (acceptEdits, plan, dontAsk, etc.)
    if (adapterConfig?.permissionMode) {
      args.push('--permission-mode', adapterConfig.permissionMode);
    }

    // Execution limits (--print mode only)
    if (!this.isInteractive(config)) {
      if (adapterConfig?.maxTurns) {
        args.push('--max-turns', String(adapterConfig.maxTurns));
      }
      if (adapterConfig?.maxBudgetUsd) {
        args.push('--max-budget-usd', String(adapterConfig.maxBudgetUsd));
      }
    }

    // Append approval preset CLI flags
    const approvalConfig = this.getApprovalConfig(config);
    if (approvalConfig) {
      args.push(...approvalConfig.cliFlags);
    }

    return args;
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    const env: Record<string, string> = {};
    const credentials = this.getCredentials(config);
    const adapterConfig = config.adapterConfig as
      | ClaudeAdapterConfig
      | undefined;

    // API key from credentials or env
    if (credentials.anthropicKey) {
      env.ANTHROPIC_API_KEY = credentials.anthropicKey;
    }

    // Model selection (if specified in config env)
    if (config.env?.ANTHROPIC_MODEL) {
      env.ANTHROPIC_MODEL = config.env.ANTHROPIC_MODEL;
    }

    // Disable interactive features for automation (skip if interactive mode)
    if (!this.isInteractive(config)) {
      env.CLAUDE_CODE_DISABLE_INTERACTIVE = 'true';
    }

    // Optional: hook telemetry mode. When enabled, hook scripts can emit
    // deterministic marker lines that this adapter consumes.
    if (adapterConfig?.claudeHookTelemetry) {
      env.PARALLAX_CLAUDE_HOOK_TELEMETRY = '1';
      env.PARALLAX_CLAUDE_HOOK_MARKER_PREFIX =
        adapterConfig.claudeHookMarkerPrefix || CLAUDE_HOOK_MARKER_PREFIX;
    }

    return env;
  }

  override getHookTelemetryProtocol(options?: {
    scriptPath?: string;
    markerPrefix?: string;
    httpUrl?: string;
    sessionId?: string;
  }): {
    markerPrefix: string;
    scriptPath: string;
    scriptContent: string;
    settingsHooks: Record<string, unknown>;
  } {
    // HTTP hook mode: generate HTTP hook entries instead of command hooks
    if (options?.httpUrl) {
      const httpHookBase: Record<string, unknown> = {
        type: 'http',
        url: options.httpUrl,
        timeout: 5,
      };
      // Inject session ID header if available (env var resolved at runtime)
      if (options.sessionId) {
        httpHookBase.headers = { 'X-Parallax-Session-Id': options.sessionId };
      }

      const hookEntry = [{ matcher: '', hooks: [{ ...httpHookBase }] }];
      const hookEntryNoMatcher = [{ hooks: [{ ...httpHookBase }] }];

      const settingsHooks: Record<string, unknown> = {
        PermissionRequest: hookEntryNoMatcher,
        PreToolUse: hookEntry,
        Stop: hookEntryNoMatcher,
        Notification: hookEntry,
        TaskCompleted: hookEntryNoMatcher,
      };

      return {
        markerPrefix: '',
        scriptPath: '',
        scriptContent: '',
        settingsHooks,
      };
    }

    // Command hook mode (fallback): emit marker lines to stdout
    const markerPrefix = options?.markerPrefix || CLAUDE_HOOK_MARKER_PREFIX;
    const scriptPath =
      options?.scriptPath || '.claude/hooks/parallax-hook-telemetry.sh';
    const scriptCommand = `"${'$'}CLAUDE_PROJECT_DIR"/${scriptPath}`;
    const hookEntry = [
      { matcher: '', hooks: [{ type: 'command', command: scriptCommand }] },
    ];

    const settingsHooks: Record<string, unknown> = {
      Notification: hookEntry,
      PreToolUse: hookEntry,
      TaskCompleted: hookEntry,
      SessionEnd: hookEntry,
    };

    const scriptContent = `#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
[ -z "${'$'}INPUT" ] && exit 0

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

EVENT="$(printf '%s' "${'$'}INPUT" | jq -r '.hook_event_name // empty')"
[ -z "${'$'}EVENT" ] && exit 0

NOTIFICATION_TYPE="$(printf '%s' "${'$'}INPUT" | jq -r '.notification_type // empty')"
TOOL_NAME="$(printf '%s' "${'$'}INPUT" | jq -r '.tool_name // empty')"
MESSAGE="$(printf '%s' "${'$'}INPUT" | jq -r '.message // empty')"

printf '%s ' '${markerPrefix}'
jq -nc \
  --arg event "${'$'}EVENT" \
  --arg notification_type "${'$'}NOTIFICATION_TYPE" \
  --arg tool_name "${'$'}TOOL_NAME" \
  --arg message "${'$'}MESSAGE" \
  '({event: $event}
   + (if $notification_type != "" then {notification_type: $notification_type} else {} end)
   + (if $tool_name != "" then {tool_name: $tool_name} else {} end)
   + (if $message != "" then {message: $message} else {} end))'
`;

    return {
      markerPrefix,
      scriptPath,
      scriptContent,
      settingsHooks,
    };
  }

  private getHookMarkers(output: string): ClaudeHookMarker[] {
    const markers: ClaudeHookMarker[] = [];
    const markerRegex = /(?:^|\n)\s*([A-Z0-9_]+)\s+(\{[^\n\r]+\})/g;
    let match: RegExpExecArray | null;

    while ((match = markerRegex.exec(output)) !== null) {
      const markerToken = match[1];
      if (!markerToken.includes('CLAUDE_HOOK')) {
        continue;
      }
      const payload = match[2];
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const event =
          typeof parsed.event === 'string' ? parsed.event : undefined;
        if (!event) continue;
        markers.push({
          event,
          notification_type:
            typeof parsed.notification_type === 'string'
              ? parsed.notification_type
              : undefined,
          tool_name:
            typeof parsed.tool_name === 'string' ? parsed.tool_name : undefined,
          message:
            typeof parsed.message === 'string' ? parsed.message : undefined,
        });
      } catch {
        // Ignore malformed marker payloads.
      }
    }

    return markers;
  }

  private getLatestHookMarker(output: string): ClaudeHookMarker | null {
    const markers = this.getHookMarkers(output);
    return markers.length > 0 ? markers[markers.length - 1] : null;
  }

  private stripHookMarkers(output: string): string {
    return output.replace(
      /(?:^|\n)\s*[A-Z0-9_]*CLAUDE_HOOK[A-Z0-9_]*\s+\{[^\n\r]+\}\s*/g,
      '\n'
    );
  }

  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    // Check for CLI login required (Claude Code >= 1.x interactive mode)
    // Pattern: "Not logged in · Please run /login"
    if (
      stripped.includes('Not logged in') ||
      stripped.includes('Please run /login') ||
      stripped.includes('please log in') ||
      stripped.includes('run /login')
    ) {
      return {
        required: true,
        type: 'cli_auth',
        instructions:
          'Claude Code requires authentication. Run "claude login" in your terminal.',
      };
    }

    // Check for API key issues
    if (
      stripped.includes('API key not found') ||
      stripped.includes('ANTHROPIC_API_KEY') ||
      stripped.includes('authentication required') ||
      stripped.includes('Please sign in') ||
      stripped.includes('Invalid API key')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions:
          'Set ANTHROPIC_API_KEY environment variable or provide credentials in adapterConfig',
      };
    }

    // Check for OAuth/browser login
    if (
      stripped.includes('Open this URL') ||
      stripped.includes('browser to authenticate')
    ) {
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'browser',
        url: urlMatch ? urlMatch[0] : undefined,
        instructions: 'Browser authentication required',
      };
    }

    return { required: false };
  }

  /**
   * Detect blocking prompts specific to Claude Code CLI
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);

    // Skip blocking prompt detection when the output is just spinner/loading text.
    // Claude Code's TUI renders spinner words ("Tomfoolering…", "Recombobulating…")
    // that produce partial fragments across buffer boundaries (e.g. "lculating…\n").
    // These fragments can false-positive as blocking prompts if not filtered early.
    if (this.detectLoading(output)) {
      return { detected: false };
    }
    // Spinner fragment: a single short word fragment ending in … or ... with trailing whitespace.
    // Catches partial spinner words split across buffer boundaries.
    // Also catches spinner frame characters (·, ✢, ✳, ✶, ✻, ✽) from leaked source.
    const trimmedTail = stripped.slice(-200).trim();
    if (/^[a-zA-Z]{1,30}(?:…|\.{3})\s*$/.test(trimmedTail)) {
      return { detected: false };
    }
    if (/^[·✢✳✶✻✽\*]\s+[A-Z]/.test(trimmedTail)) {
      return { detected: false };
    }

    // First check for login (highest priority)
    const loginDetection = this.detectLogin(output);
    if (loginDetection.required) {
      return {
        detected: true,
        type: 'login',
        prompt: loginDetection.instructions,
        url: loginDetection.url,
        canAutoRespond: false,
        instructions: loginDetection.instructions,
      };
    }

    if (marker?.event === 'Notification') {
      if (marker.notification_type === 'permission_prompt') {
        return {
          detected: true,
          type: 'permission',
          prompt: marker.message || 'Claude permission prompt',
          suggestedResponse: 'keys:enter',
          canAutoRespond: true,
          instructions: 'Claude is waiting for permission approval',
        };
      }
      if (marker.notification_type === 'elicitation_dialog') {
        return {
          detected: true,
          type: 'tool_wait',
          prompt: marker.message || 'Claude elicitation dialog',
          canAutoRespond: false,
          instructions: 'Claude is waiting for required user input',
        };
      }
    }

    // From leaked source: exact bypass permissions dialog text.
    // Title: "WARNING: Claude Code running in Bypass Permissions mode"
    // Options: "No, exit" and "Yes, I accept"
    if (
      /WARNING.*Bypass Permissions mode|Bypass Permissions mode.*accept all responsibility/is.test(
        stripped
      ) &&
      (/No,?\s*exit/i.test(stripped) || /Yes,?\s*I accept/i.test(stripped))
    ) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Bypass Permissions confirmation',
        options: ['1', '2'],
        suggestedResponse: '2',
        canAutoRespond: true,
        instructions:
          'Claude is asking to confirm bypass permissions mode; reply 2 to accept',
      };
    }

    // From leaked source: credit balance too low
    if (/Credit balance too low/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Credit balance too low',
        canAutoRespond: false,
        instructions:
          'Anthropic account credit balance is too low to continue. Add funds at https://platform.claude.com/settings/billing',
      };
    }

    // From leaked source: context limit reached (non-auto-respond version)
    if (
      /Context limit reached/i.test(stripped) &&
      !/\/compact or \/clear/i.test(stripped)
    ) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Context limit reached',
        suggestedResponse: '/compact',
        canAutoRespond: true,
        instructions: 'Context window full — run /compact to continue',
      };
    }

    // Claude survey/feedback prompt (optional)
    if (
      /how is claude doing this session\?\s*\(optional\)|1:\s*bad\s+2:\s*fine\s+3:\s*good\s+0:\s*dismiss/i.test(
        stripped
      )
    ) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Claude session survey',
        options: ['1', '2', '3', '0'],
        suggestedResponse: '0',
        canAutoRespond: true,
        instructions: 'Optional survey prompt; reply 0 to dismiss',
      };
    }

    // Generic Claude modal/dialog controls discovered from live capture
    if (
      /enter\/tab\/space to toggle.*esc to cancel|enter to confirm.*esc to cancel|esc to close/i.test(
        stripped
      )
    ) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Claude dialog awaiting navigation',
        options: ['keys:enter', 'keys:esc', 'keys:down,enter'],
        suggestedResponse: 'keys:esc',
        canAutoRespond: false,
        instructions: 'Use Enter/Esc or arrow keys to navigate this dialog',
      };
    }

    // Slash-menu screens where navigation keys are required.
    // Important: startup status lines can include "/chrome" (for example:
    // "Claude in Chrome enabled · /chrome") but are not blocking prompts.
    // Require either explicit navigation instructions or an interactive
    // menu-style line with a prompt/selection marker.
    if (
      /press .* to navigate .* enter .* esc|use (?:arrow|↑↓) keys|enter to select|esc to (?:go back|close|cancel)/i.test(
        stripped
      ) ||
      /(?:^|\n)\s*(?:❯|>)\s*\/(?:agents|chrome|config|tasks|skills|remote-env)\b/im.test(
        stripped
      )
    ) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Claude menu navigation required',
        options: ['keys:esc', 'keys:enter', 'keys:down,enter'],
        suggestedResponse: 'keys:esc',
        canAutoRespond: false,
        instructions:
          'Claude is showing an interactive menu; use arrow keys + Enter or Esc',
      };
    }

    // From leaked source: exact permission prompt texts.
    // - "Do you want to proceed?" (generic permission)
    // - "Do you want to make this edit to {filename}?" (file edit)
    // - "Claude needs your permission to use {toolName}" (tool use)
    // - "Claude Code needs your attention" (generic fallback)
    if (
      /Do you want to|wants? (?:your )?permission|needs your permission|needs your (?:approval|attention)/i.test(
        stripped
      )
    ) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Claude tool permission',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Claude is asking permission to use a tool',
      };
    }

    // Claude-specific: Model selection prompt
    if (
      /choose.*model|select.*model|available models/i.test(stripped) &&
      /\d+\)|claude-/i.test(stripped)
    ) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Claude model selection',
        canAutoRespond: false,
        instructions:
          'Please select a Claude model or set ANTHROPIC_MODEL env var',
      };
    }

    // Claude-specific: API key tier/plan selection
    if (/which.*tier|select.*plan|api.*tier/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'API tier selection',
        canAutoRespond: false,
        instructions: 'Please select an API tier',
      };
    }

    // Claude-specific: First-time setup wizard
    if (
      /welcome to claude|first time setup|initial configuration/i.test(stripped)
    ) {
      return {
        detected: true,
        type: 'config',
        prompt: 'First-time setup',
        canAutoRespond: false,
        instructions: 'Claude Code requires initial configuration',
      };
    }

    // Claude-specific: Permission to access files/directories
    if (
      /allow.*access|grant.*permission|access to .* files/i.test(stripped) &&
      /\[y\/n\]/i.test(stripped)
    ) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'File/directory access permission',
        options: ['y', 'n'],
        suggestedResponse: 'y',
        canAutoRespond: true,
        instructions: 'Claude Code requesting file access permission',
      };
    }

    // If explicit blocking patterns did not match and output is clearly idle
    // or task-complete, avoid generic fallback misclassifying residual text
    // (e.g. "? for shortcuts", status bar fragments) as a blocking prompt.
    if (this.detectReady(output) || this.detectTaskComplete(output)) {
      return { detected: false };
    }

    // Suppress the base-class "last line ends with ?" fallback when the output
    // contains Claude's idle prompt (❯) — the "? for shortcuts" hint and TUI
    // status bar lines arrive in separate chunks, so detectReady may not match
    // yet, but a bare "?" is not a real blocking prompt.
    if (/❯/.test(stripped.slice(-300))) {
      return { detected: false };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  /**
   * Detect if Claude Code is actively loading/processing.
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - claude_active_reading_files: "Reading N files…"
   *   - General: "esc to interrupt" spinner status line
   */
  detectLoading(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    const tail = stripped.slice(-500);

    if (marker?.event === 'PreToolUse') {
      return true;
    }

    // Active spinner with "esc to interrupt" — agent is working
    if (/esc\s+to\s+interrupt/i.test(tail)) {
      return true;
    }

    // "Reading N files" loading indicator
    if (/Reading\s+\d+\s+files/i.test(tail)) {
      return true;
    }

    // Spinner verb from Claude Code source (e.g. "Cogitating…", "Vibing…")
    if (SPINNER_VERB_RE.test(tail)) {
      return true;
    }

    // Spinner frame characters (·, ✢, ✳, ✶, ✻, ✽) at start of a line
    // followed by a capitalized word — indicates active thinking animation.
    // Must be at line start to avoid matching middle-dot separators like "Enter · Esc".
    if (/(?:^|\n)\s*[✢✳✶✻✽]\s+[A-Z][a-z]/.test(tail)) {
      return true;
    }

    return false;
  }

  /**
   * Detect if an external tool/process is running within the Claude session.
   *
   * Claude Code can launch external tools (browser, bash, Node, Python, etc.)
   * that show status lines like "Claude in Chrome[javascript_tool]" or
   * "[bash_tool]", "[python_tool]", etc.
   *
   * When detected, stall detection is suppressed and the UI can display
   * which tool is active.
   */
  detectToolRunning(output: string): ToolRunningInfo | null {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    const tail = stripped.slice(-500);

    if (marker?.event === 'PreToolUse' && marker.tool_name) {
      return {
        toolName: marker.tool_name.toLowerCase(),
        description: `${marker.tool_name} (hook)`,
      };
    }

    // Prefer contextual pattern: "Claude in <App>[tool_name]".
    // Do not treat "Claude in <App> enabled · /chrome" as a running tool.
    const contextualMatch = tail.match(
      /Claude\s+in\s+([A-Za-z0-9._-]+)\s*\[(\w+_tool)\]/i
    );
    if (contextualMatch) {
      const appName = contextualMatch[1];
      const toolType = contextualMatch[2].toLowerCase();
      const friendlyName = toolType.replace(/_tool$/i, '');
      return {
        toolName: friendlyName,
        description: `${appName} (${toolType})`,
      };
    }

    // Generic fallback: bracketed tool token anywhere in tail.
    // This still detects [bash_tool], [python_tool], etc., but intentionally
    // avoids deriving app context from unrelated status lines.
    const toolMatch = tail.match(/\[(\w+_tool)\]/i);
    if (toolMatch) {
      const toolType = toolMatch[1].toLowerCase();
      const friendlyName = toolType.replace(/_tool$/i, '');
      return { toolName: friendlyName, description: toolType };
    }

    return null;
  }

  /**
   * Detect task completion for Claude Code.
   *
   * High-confidence pattern: turn duration summary + idle prompt.
   * Claude Code shows "<Verb> for Xm Ys" (e.g. "Cooked for 3m 12s")
   * when a turn completes, followed by the ❯ input prompt.
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - claude_completed_turn_duration
   *   - claude_completed_turn_duration_custom_verb
   */
  detectTaskComplete(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    if (!stripped.trim()) return false;

    if (marker?.event === 'TaskCompleted') {
      return true;
    }
    if (
      marker?.event === 'Notification' &&
      marker.notification_type === 'idle_prompt'
    ) {
      return true;
    }
    // NOTE: Do NOT call detectLoading() here. The buffer often contains stale
    // loading patterns (e.g. "esc to interrupt" from the spinner) alongside
    // completion signals. Task completion is a more specific signal and should
    // not be suppressed by loading detection — that priority is handled at the
    // PTY session level in onStallTimerFired().

    // If Claude is waiting for a confirmation, it's not task-complete idle.
    if (
      /trust.*directory|do you want to|needs? your permission/i.test(stripped)
    ) {
      return false;
    }

    // Turn duration pattern: known completion verbs from Claude Code source
    // (Baked, Brewed, Churned, Cogitated, Cooked, Crunched, Sautéed, Worked).
    // Also allow unknown verbs as fallback — Claude Code may add more.
    // Budget info may follow: "· 1,234 / 2,048 (60%)"
    const hasDuration =
      TURN_DURATION_RE.test(stripped) ||
      /[A-Z][A-Za-z' -]{2,40}\s+for\s+\d+(?:h\s+\d{1,2}m\s+\d{1,2}s|m\s+\d{1,2}s|s)/.test(
        stripped
      );

    // Idle prompt: ❯ in the tail of the output.
    // The status bar (file counts, PR info, "Update available", etc.) renders
    // *after* the ❯ prompt in the TUI output stream, so we can't anchor to $.
    const tail = stripped.slice(-300);
    const hasIdlePrompt = /❯/.test(tail);

    // High confidence: duration summary + idle prompt
    if (hasDuration && hasIdlePrompt) {
      return true;
    }

    // Medium confidence: idle prompt with "for shortcuts" hint (post-task state)
    if (hasIdlePrompt && stripped.includes('for shortcuts')) {
      return true;
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    if (!stripped.trim()) return false;

    if (marker?.event === 'Notification') {
      if (
        marker.notification_type === 'permission_prompt' ||
        marker.notification_type === 'elicitation_dialog'
      ) {
        return false;
      }
      if (marker.notification_type === 'idle_prompt') {
        return true;
      }
    }
    // Same rationale as detectTaskComplete: don't let stale loading patterns
    // in the buffer suppress ready detection.

    // Guard: if the output contains a trust prompt or permission, not ready.
    if (
      /trust.*directory|do you want to|needs? your permission|needs your (?:approval|attention)/i.test(
        stripped
      )
    ) {
      return false;
    }

    // From leaked source: vim mode indicator means user is typing, not ready
    if (/-- INSERT --/.test(stripped.slice(-200))) {
      return false;
    }

    // Claude Code shows a prompt when ready
    // Only match specific interactive prompts, not banner text like "Claude Code"
    // or generic words like "Ready" which appear alongside auth/trust screens
    // Check the tail for prompt patterns — the status bar (file counts,
    // PR info, "Update available", etc.) renders *after* the prompt in the
    // TUI output stream, so we can't anchor to $.
    const tail = stripped.slice(-300);
    const hasConversationalReadyText =
      stripped.includes('How can I help') ||
      stripped.includes('What would you like');

    const hasLegacyPrompt = /claude>/i.test(tail);
    const hasShortcutsHint = stripped.includes('for shortcuts');
    const hasInteractivePromptBar =
      /❯\s+\S/.test(tail) &&
      (/\/effort/i.test(stripped) ||
        /Welcome back/i.test(stripped) ||
        /Recent activity/i.test(stripped) ||
        /What's new/i.test(stripped));

    // Deliberately do NOT treat a bare "❯" as ready. Claude's TUI redraws
    // can emit transient prompt glyphs before fully settling.
    return (
      hasConversationalReadyText ||
      hasLegacyPrompt ||
      hasShortcutsHint ||
      hasInteractivePromptBar
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const withoutHookMarkers = this.stripHookMarkers(output);
    const stripped = this.stripAnsi(withoutHookMarkers);

    // Check if this looks like a complete response
    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    // Determine if this is a question
    const isQuestion = this.containsQuestion(stripped);

    // Extract the actual content
    const content = this.extractContent(stripped, /^.*>\s*/gm);

    return {
      type: isQuestion ? 'question' : 'response',
      content,
      isComplete: true,
      isQuestion,
      metadata: {
        raw: output,
      },
    };
  }

  getPromptPattern(): RegExp {
    // Claude Code prompt patterns
    // Match "claude> " specifically, not bare ">" which is too broad
    return /claude>\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'claude --version';
  }

  override detectExit(output: string): {
    exited: boolean;
    code?: number;
    error?: string;
  } {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    if (marker?.event === 'SessionEnd') {
      return { exited: true, code: 0 };
    }
    return super.detectExit(output);
  }
}
