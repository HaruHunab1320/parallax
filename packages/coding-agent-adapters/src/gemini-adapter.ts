/**
 * Google Gemini CLI Adapter
 *
 * Adapter for the Google Gemini CLI tool.
 */

import type {
  SpawnConfig,
  ParsedOutput,
  LoginDetection,
  BlockingPromptDetection,
  AutoResponseRule,
  ToolRunningInfo,
} from 'adapter-types';
import { BaseCodingAdapter, type InstallationInfo, type ModelRecommendations, type AgentCredentials, type AgentFileDescriptor } from './base-coding-adapter';

const GEMINI_HOOK_MARKER_PREFIX = 'PARALLAX_GEMINI_HOOK';

interface GeminiHookMarker {
  event: string;
  notification_type?: string;
  tool_name?: string;
  message?: string;
}

interface GeminiAdapterConfig {
  geminiHookTelemetry?: boolean;
  geminiHookMarkerPrefix?: string;
}

export class GeminiAdapter extends BaseCodingAdapter {
  readonly adapterType = 'gemini';
  readonly displayName = 'Google Gemini';

  readonly installation: InstallationInfo = {
    command: 'npm install -g @google/gemini-cli',
    alternatives: [
      'See documentation for latest installation method',
    ],
    docsUrl: 'https://github.com/google-gemini/gemini-cli#installation',
  };

  /**
   * Auto-response rules for Gemini CLI.
   * Gemini uses Ink/React TUI with arrow-key radio menus.
   * Source: FolderTrustDialog.tsx, MultiFolderTrustDialog.tsx, CloudFreePrivacyNotice.tsx
   */
  readonly autoResponseRules: AutoResponseRule[] = [
    {
      pattern: /do.?you.?trust.?this.?folder|trust.?folder|trust.?parent.?folder/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Trust current folder (default selection in radio menu)',
      safe: true,
      once: true,
    },
    {
      pattern: /trust.?the.?following.?folders.*(added|workspace)/i,
      type: 'permission',
      response: '',
      responseType: 'keys',
      keys: ['enter'],
      description: 'Trust multiple folders being added to workspace',
      safe: true,
      once: true,
    },
    {
      pattern: /allow.?google.?to.?use.?this.?data/i,
      type: 'config',
      response: '',
      responseType: 'keys',
      keys: ['down', 'enter'],
      description: 'Decline Google data collection (select "No")',
      safe: true,
      once: true,
    },
  ];

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'GEMINI.md',
        description: 'Project-level instructions read automatically on startup',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: '.gemini/settings.json',
        description: 'Project-scoped settings (tool permissions, sandbox config)',
        autoLoaded: true,
        type: 'config',
        format: 'json',
      },
      {
        relativePath: '.gemini/styles',
        description: 'Custom style/persona definitions directory',
        autoLoaded: false,
        type: 'config',
        format: 'markdown',
      },
    ];
  }

  getRecommendedModels(_credentials?: AgentCredentials): ModelRecommendations {
    return {
      powerful: 'gemini-3-pro',
      fast: 'gemini-3-flash',
    };
  }

  getCommand(): string {
    return 'gemini';
  }

  getArgs(config: SpawnConfig): string[] {
    const args: string[] = [];

    // Non-interactive mode (skip if interactive mode)
    if (!this.isInteractive(config)) {
      args.push('--non-interactive');
      // Text output for easier parsing (only in non-interactive mode)
      args.push('--output-format', 'text');

      // Set working directory in non-interactive mode
      // In interactive/PTY mode, the PTY's cwd is already set by spawn config
      if (config.workdir) {
        args.push('--cwd', config.workdir);
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
    const adapterConfig = config.adapterConfig as GeminiAdapterConfig | undefined;

    // Google API key from credentials
    if (credentials.googleKey) {
      env.GOOGLE_API_KEY = credentials.googleKey;
      env.GEMINI_API_KEY = credentials.googleKey;
    }

    // Model selection from config env
    if (config.env?.GEMINI_MODEL) {
      env.GEMINI_MODEL = config.env.GEMINI_MODEL;
    }

    // Disable color for parsing (skip if interactive mode)
    if (!this.isInteractive(config)) {
      env.NO_COLOR = '1';
    }

    // Optional: hook telemetry mode. Gemini hooks can emit marker lines
    // via systemMessage in valid JSON responses.
    if (adapterConfig?.geminiHookTelemetry) {
      env.PARALLAX_GEMINI_HOOK_TELEMETRY = '1';
      env.PARALLAX_GEMINI_HOOK_MARKER_PREFIX =
        adapterConfig.geminiHookMarkerPrefix || GEMINI_HOOK_MARKER_PREFIX;
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
    // HTTP hook mode: generate command hooks that curl the orchestrator endpoint.
    // Gemini CLI only supports command hooks (no native HTTP), so we bridge
    // stdin JSON → curl POST → pipe response JSON back to stdout.
    if (options?.httpUrl) {
      const sessionHeader = options.sessionId
        ? ` -H 'X-Parallax-Session-Id: ${options.sessionId}'`
        : '';
      // The command reads Gemini's hook JSON from stdin, POSTs it to the
      // orchestrator, and pipes the JSON response back to stdout. On curl
      // failure, emit a safe no-op JSON so Gemini continues normally.
      const curlCommand =
        `bash -c 'curl -sf -X POST "${options.httpUrl}"` +
        ` -H "Content-Type: application/json"${sessionHeader}` +
        ` -d @- --max-time 4 2>/dev/null || echo "{\\"continue\\":true}"'`;

      const hookEntry = [{ matcher: '', hooks: [{ type: 'command', command: curlCommand, timeout: 5000 }] }];
      const hookEntryNoMatcher = [{ hooks: [{ type: 'command', command: curlCommand, timeout: 5000 }] }];

      const settingsHooks: Record<string, unknown> = {
        BeforeTool: hookEntry,
        AfterTool: hookEntry,
        AfterAgent: hookEntryNoMatcher,
        SessionEnd: hookEntryNoMatcher,
        Notification: hookEntry,
      };

      return {
        markerPrefix: '',
        scriptPath: '',
        scriptContent: '',
        settingsHooks,
      };
    }

    // Command hook mode (fallback): emit marker lines via systemMessage
    const markerPrefix = options?.markerPrefix || GEMINI_HOOK_MARKER_PREFIX;
    const scriptPath = options?.scriptPath || '.gemini/hooks/parallax-hook-telemetry.sh';
    const scriptCommand = `"${'$'}GEMINI_PROJECT_ROOT"/${scriptPath}`;
    const hookEntry = [{ matcher: '', hooks: [{ type: 'command', command: scriptCommand }] }];

    const settingsHooks: Record<string, unknown> = {
      Notification: hookEntry,
      BeforeTool: hookEntry,
      AfterAgent: hookEntry,
      SessionEnd: hookEntry,
    };

    // Gemini hook stdout must be valid JSON. We encode marker output through
    // systemMessage so the marker still appears in terminal output.
    const scriptContent = `#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
[ -z "${'$'}INPUT" ] && exit 0

if ! command -v jq >/dev/null 2>&1; then
  # Valid no-op response
  printf '%s\n' '{"continue":true}'
  exit 0
fi

EVENT="$(printf '%s' "${'$'}INPUT" | jq -r '.hookEventName // .hook_event_name // empty')"
[ -z "${'$'}EVENT" ] && { printf '%s\n' '{"continue":true}'; exit 0; }

NOTIFICATION_TYPE="$(printf '%s' "${'$'}INPUT" | jq -r '.notificationType // .notification_type // empty')"
TOOL_NAME="$(printf '%s' "${'$'}INPUT" | jq -r '.toolName // .tool_name // empty')"
MESSAGE="$(printf '%s' "${'$'}INPUT" | jq -r '.message // empty')"

PAYLOAD="$(jq -nc \\
  --arg event "${'$'}EVENT" \\
  --arg notification_type "${'$'}NOTIFICATION_TYPE" \\
  --arg tool_name "${'$'}TOOL_NAME" \\
  --arg message "${'$'}MESSAGE" \\
  '({event: $event}
   + (if $notification_type != "" then {notification_type: $notification_type} else {} end)
   + (if $tool_name != "" then {tool_name: $tool_name} else {} end)
   + (if $message != "" then {message: $message} else {} end))')"

MARKER="${markerPrefix} ${'$'}PAYLOAD"
jq -nc --arg m "${'$'}MARKER" '{continue: true, suppressOutput: true, systemMessage: $m}'
`;

    return {
      markerPrefix,
      scriptPath,
      scriptContent,
      settingsHooks,
    };
  }

  private getHookMarkers(output: string): GeminiHookMarker[] {
    const markers: GeminiHookMarker[] = [];
    const markerRegex = /(?:^|\n)\s*([A-Z0-9_]+)\s+(\{[^\n\r]+\})/g;
    let match: RegExpExecArray | null;

    while ((match = markerRegex.exec(output)) !== null) {
      const markerToken = match[1];
      if (!markerToken.includes('GEMINI_HOOK')) {
        continue;
      }
      const payload = match[2];
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const event = typeof parsed.event === 'string' ? parsed.event : undefined;
        if (!event) continue;
        markers.push({
          event,
          notification_type: typeof parsed.notification_type === 'string' ? parsed.notification_type : undefined,
          tool_name: typeof parsed.tool_name === 'string' ? parsed.tool_name : undefined,
          message: typeof parsed.message === 'string' ? parsed.message : undefined,
        });
      } catch {
        // Ignore malformed marker payloads.
      }
    }

    return markers;
  }

  private getLatestHookMarker(output: string): GeminiHookMarker | null {
    const markers = this.getHookMarkers(output);
    return markers.length > 0 ? markers[markers.length - 1] : null;
  }

  private stripHookMarkers(output: string): string {
    return output.replace(/(?:^|\n)\s*[A-Z0-9_]*GEMINI_HOOK[A-Z0-9_]*\s+\{[^\n\r]+\}\s*/g, '\n');
  }

  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    // Check for API key issues.
    // Must require error context — "Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using ..."
    // is a success message, not an auth error.
    if (
      stripped.includes('API key not found') ||
      /set (?:GOOGLE_API_KEY|GEMINI_API_KEY)/i.test(stripped) ||
      stripped.includes('authentication required') ||
      stripped.includes('Invalid API key') ||
      stripped.includes('API key is not valid')
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable',
      };
    }

    // Gemini API key entry dialog (ApiAuthDialog.tsx)
    if (/enter.?gemini.?api.?key/i.test(stripped)) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Enter a Gemini API key or set GEMINI_API_KEY environment variable',
      };
    }

    // Auth dialog — initial auth choice (AuthDialog.tsx)
    if (/how.?would.?you.?like.?to.?authenticate/i.test(stripped) ||
        (/get.?started/i.test(stripped) && /login.?with.?google|use.?gemini.?api.?key|vertex/i.test(stripped))) {
      return {
        required: true,
        type: 'oauth',
        instructions: 'Gemini CLI authentication required — select an auth method',
      };
    }

    // OAuth in-progress (AuthInProgress.tsx)
    if (/waiting.?for.?auth/i.test(stripped)) {
      return {
        required: true,
        type: 'oauth',
        instructions: 'Waiting for browser authentication to complete',
      };
    }

    // Check for OAuth flow
    if (
      stripped.includes('Sign in with Google') ||
      stripped.includes('OAuth') ||
      stripped.includes('accounts.google.com')
    ) {
      const urlMatch = stripped.match(/https?:\/\/[^\s]+/);
      return {
        required: true,
        type: 'oauth',
        url: urlMatch ? urlMatch[0] : 'https://accounts.google.com',
        instructions: 'Google OAuth authentication required',
      };
    }

    // Check for ADC (Application Default Credentials)
    if (
      stripped.includes('Application Default Credentials') ||
      stripped.includes('gcloud auth')
    ) {
      return {
        required: true,
        type: 'browser',
        instructions: 'Run: gcloud auth application-default login',
      };
    }

    return { required: false };
  }

  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);

    if (marker?.event === 'Notification' && marker.notification_type === 'ToolPermission') {
      return {
        detected: true,
        type: 'permission',
        prompt: marker.message || 'Gemini tool permission',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Gemini is asking to allow a tool action',
      };
    }

    // Tool permission / execution confirmation (ToolConfirmationMessage.tsx)
    // Check BEFORE login — permission prompts contain "API key" banner text
    // that would otherwise false-positive the login detector.
    // TUI arrow-key menu — use keys:enter to select "Allow once" (default)
    if (/apply.?this.?change\??/i.test(stripped) ||
        /allow.?execution.?of/i.test(stripped) ||
        /do.?you.?want.?to.?proceed\??/i.test(stripped) ||
        /waiting.?for.?user.?confirmation/i.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Gemini tool execution confirmation',
        suggestedResponse: 'keys:enter',
        canAutoRespond: true,
        instructions: 'Gemini is asking to apply a change (file write, shell command, etc.)',
      };
    }

    // Interactive shell command confirmation prompts (inside tool output).
    // Example from captures: "Do you want to continue (Y/n)?"
    if (/do.?you.?want.?to.?continue\s*\([yY]\/[nN]\)\??/i.test(stripped) ||
        /continue\??\s*\([yY]\/[nN]\)\??/i.test(stripped) ||
        /are.?you.?sure\??\s*\([yY]\/[nN]\)\??/i.test(stripped)) {
      return {
        detected: true,
        type: 'tool_wait',
        prompt: 'Interactive shell confirmation required (y/n)',
        canAutoRespond: false,
        instructions: 'Focus shell input (Tab) and answer the y/n confirmation prompt',
      };
    }

    // Interactive shell awaiting input (usePhraseCycler.ts)
    if (/Interactive\s+shell\s+awaiting\s+input/i.test(stripped)) {
      return {
        detected: true,
        type: 'tool_wait',
        prompt: 'Gemini interactive shell needs user focus',
        canAutoRespond: false,
        instructions: 'Press Tab to focus the interactive shell, or wait for it to complete',
      };
    }

    // Session checkpoint prompt
    if (/enable.?checkpointing.?to.?recover.?your.?session.?after.?a.?crash/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Gemini checkpoint setup prompt',
        canAutoRespond: false,
        instructions: 'Respond to checkpoint setup prompt (for example: press "s" to configure or dismiss)',
      };
    }

    // Login check — after permission prompts
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

    // Account validation required (ValidationDialog.tsx)
    if (/further.?action.?is.?required/i.test(stripped) ||
        /verify.?your.?account/i.test(stripped) ||
        /waiting.?for.?verification/i.test(stripped)) {
      return {
        detected: true,
        type: 'config',
        prompt: 'Account verification required',
        canAutoRespond: false,
        instructions: 'Your Gemini account requires verification before continuing',
      };
    }

    // Model selection
    if (/select.*model|choose.*model|gemini-/i.test(stripped) &&
        /\d+\)/i.test(stripped)) {
      return {
        detected: true,
        type: 'model_select',
        prompt: 'Gemini model selection',
        canAutoRespond: false,
        instructions: 'Please select a model or set GEMINI_MODEL env var',
      };
    }

    // Project selection
    if (/select.*project|choose.*project|google cloud project/i.test(stripped)) {
      return {
        detected: true,
        type: 'project_select',
        prompt: 'Google Cloud project selection',
        canAutoRespond: false,
        instructions: 'Please select a Google Cloud project',
      };
    }

    // Safety filter triggered
    if (/safety.*filter|content.*blocked|unsafe.*content/i.test(stripped)) {
      return {
        detected: true,
        type: 'unknown',
        prompt: 'Safety filter triggered',
        canAutoRespond: false,
        instructions: 'Content was blocked by safety filters',
      };
    }

    // Fall back to base class detection
    return super.detectBlockingPrompt(output);
  }

  /**
   * Detect if Gemini CLI is actively loading/processing.
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - gemini_active_loading_line: "(esc to cancel, Xs)"
   *   - gemini_active_waiting_user_confirmation: "Waiting for user confirmation..."
   */
  detectLoading(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    const tail = stripped.slice(-500);

    if (marker?.event === 'BeforeTool') {
      return true;
    }

    // Active loading indicator with "esc to cancel" + timer
    if (/esc\s+to\s+cancel/i.test(tail)) {
      return true;
    }

    // Waiting for user confirmation (streaming state)
    if (/Waiting\s+for\s+user\s+confirmation/i.test(tail)) {
      return true;
    }

    return false;
  }

  detectToolRunning(output: string): ToolRunningInfo | null {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);
    if (marker?.event === 'BeforeTool' && marker.tool_name) {
      return {
        toolName: marker.tool_name.toLowerCase(),
        description: `${marker.tool_name} (hook)`,
      };
    }
    return null;
  }

  /**
   * Detect task completion for Gemini CLI.
   *
   * High-confidence patterns:
   *   - "◇ Ready" window title signal (OSC sequence, may survive ANSI stripping)
   *   - "Type your message" composer placeholder after agent output
   *
   * Patterns from: AGENT_LOADING_STATUS_PATTERNS.json
   *   - gemini_ready_title
   */
  detectTaskComplete(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);

    if (marker?.event === 'AfterAgent') {
      return true;
    }

    // Window title "◇ Ready" is a strong task-complete signal
    if (/◇\s+Ready/.test(stripped)) {
      return true;
    }

    // Composer placeholder is definitive — the agent is idle
    if (/type.?your.?message/i.test(stripped)) {
      return true;
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);

    if (marker?.event === 'Notification' && marker.notification_type === 'ToolPermission') {
      return false;
    }
    if (marker?.event === 'AfterAgent') {
      return true;
    }

    const hasActiveOverlay =
      /interactive\s+shell\s+awaiting\s+input|press\s+tab\s+to\s+focus\s+shell/i.test(stripped) ||
      /waiting\s+for\s+user\s+confirmation|apply.?this.?change|allow.?execution|do.?you.?want.?to.?proceed/i.test(stripped) ||
      /do.?you.?want.?to.?continue\s*\([yY]\/[nN]\)\??|are.?you.?sure\??\s*\([yY]\/[nN]\)\??/i.test(stripped) ||
      /enable.?checkpointing.?to.?recover.?your.?session.?after.?a.?crash/i.test(stripped) ||
      /esc\s+to\s+cancel|esc\s+to\s+interrupt/i.test(stripped);

    if (hasActiveOverlay) {
      return false;
    }

    // Definitive positive indicators — always win, even if stale auth/trust
    // dialog text is still in the buffer from a TUI re-render.
    // "Type your message" is the Composer placeholder (Composer.tsx:446)
    // and is unambiguous — the CLI is ready to accept input.
    if (/type.?your.?message/i.test(stripped)) {
      return true;
    }

    // Guard: if output contains a trust or auth prompt, we're NOT ready
    // (only checked when no definitive positive indicator is present)
    if (/do.?you.?trust.?this.?folder/i.test(stripped) ||
        /how.?would.?you.?like.?to.?authenticate/i.test(stripped) ||
        /waiting.?for.?auth/i.test(stripped) ||
        /allow.?google.?to.?use.?this.?data/i.test(stripped)) {
      return false;
    }

    // InputPrompt glyph — >, !, *, (r:) (InputPrompt.tsx:1450)
    if (/^\s*[>!*]\s+/m.test(stripped) || /\(r:\)/.test(stripped)) {
      return true;
    }

    return (
      stripped.includes('How can I help') ||
      stripped.includes('What would you like') ||
      // Match "gemini> " prompt specifically, not bare ">"
      /gemini>\s*$/i.test(stripped)
    );
  }

  parseOutput(output: string): ParsedOutput | null {
    const withoutHookMarkers = this.stripHookMarkers(output);
    const stripped = this.stripAnsi(withoutHookMarkers);

    const isComplete = this.isResponseComplete(stripped);

    if (!isComplete) {
      return null;
    }

    const isQuestion = this.containsQuestion(stripped);

    // Extract content, removing prompts and safety warnings
    let content = this.extractContent(stripped, /^.*(?:gemini|>)\s*/gim);
    content = content.replace(/^\[Safety[^\]]*\].*$/gm, '');

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

  /**
   * Detect exit conditions specific to Gemini CLI.
   * Source: FolderTrustDialog.tsx:127, LogoutConfirmationDialog.tsx:64
   */
  override detectExit(output: string): { exited: boolean; code?: number; error?: string } {
    const stripped = this.stripAnsi(output);
    const marker = this.getLatestHookMarker(stripped);

    if (marker?.event === 'SessionEnd') {
      return {
        exited: true,
        code: 0,
      };
    }

    if (/folder.?trust.?level.?must.?be.?selected.*exiting/i.test(stripped)) {
      return {
        exited: true,
        code: 1,
        error: 'Gemini CLI exited because no folder trust level was selected',
      };
    }

    if (/you are now logged out/i.test(stripped)) {
      return {
        exited: true,
        code: 0,
      };
    }

    // Session summary / shutdown (SessionSummaryDisplay.tsx)
    if (/Agent\s+powering\s+down/i.test(stripped)) {
      return {
        exited: true,
        code: 0,
      };
    }

    return super.detectExit(output);
  }

  getPromptPattern(): RegExp {
    // Match "gemini> " specifically, not bare ">" which is too broad
    return /gemini>\s*$/i;
  }

  getHealthCheckCommand(): string {
    return 'gemini --version';
  }
}
