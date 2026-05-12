/**
 * OpenCode CLI Adapter
 *
 * Adapter for the OpenCode CLI (https://opencode.ai). OpenCode is a
 * provider-agnostic coding agent — it speaks OpenAI's chat-completions
 * protocol against any compatible endpoint (Anthropic, OpenAI, Cerebras,
 * OpenRouter, Groq, Together, DeepSeek, Ollama, vLLM, etc.) plus a
 * native Anthropic backend. Configuration is supplied to the binary via
 * the `OPENCODE_CONFIG_CONTENT` environment variable (a JSON object that
 * defines providers + the chosen model). The orchestrator constructs
 * that JSON from the user's standard provider env keys.
 *
 * Workspace-file convention matches Codex: `AGENTS.md` at the workdir
 * root is auto-loaded as project instructions on startup.
 *
 * Source: https://github.com/sst/opencode
 */

import type {
  BlockingPromptDetection,
  LoginDetection,
  ParsedOutput,
  SpawnConfig,
} from 'adapter-types';
import {
  type AgentCredentials,
  type AgentFileDescriptor,
  BaseCodingAdapter,
  type InstallationInfo,
  type ModelRecommendations,
} from './base-coding-adapter';

export class OpencodeAdapter extends BaseCodingAdapter {
  readonly adapterType = 'opencode';
  readonly displayName = 'OpenCode';

  /**
   * OpenCode's TUI is light (no full-screen ratatui-style status bar),
   * so a short settle is sufficient — matches Gemini-CLI's 300ms baseline.
   */
  override readonly readySettleMs: number = 300;

  readonly installation: InstallationInfo = {
    command: 'curl -fsSL https://opencode.ai/install | bash',
    alternatives: [
      'npm install -g opencode-ai',
      'brew install sst/tap/opencode',
    ],
    docsUrl: 'https://opencode.ai/docs',
  };

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'AGENTS.md',
        description:
          'Project-level instructions auto-loaded by OpenCode on startup (same convention as Codex).',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: 'opencode.json',
        description:
          'Optional workspace-scoped OpenCode config (provider/model overrides for this project).',
        autoLoaded: true,
        type: 'config',
        format: 'json',
      },
    ];
  }

  getRecommendedModels(credentials?: AgentCredentials): ModelRecommendations {
    // Anthropic key → Claude (OpenCode's native backend). Otherwise prefer
    // a non-reasoning OpenAI-spec model so reasoning_effort tuning isn't
    // required for the default to work.
    if (credentials?.anthropicKey) {
      return {
        powerful: 'anthropic/claude-opus-4-7',
        fast: 'anthropic/claude-haiku-4-5',
      };
    }
    return {
      powerful: 'openai/gpt-4o',
      fast: 'openai/gpt-4o-mini',
    };
  }

  getCommand(): string {
    return 'opencode';
  }

  getArgs(config: SpawnConfig): string[] {
    // OpenCode TUI launches with bare `opencode`. The `run` subcommand
    // is non-interactive: it consumes the message as the prompt, drives
    // a single agent loop, and exits. `--dangerously-skip-permissions`
    // is a `run`-subcommand flag (NOT top-level), so it must come AFTER
    // `run` — verified live with opencode 1.14.x.
    if (this.isInteractive(config)) {
      return [];
    }
    const args = ['run', '--dangerously-skip-permissions'];
    // The caller may pass the task as `config.initialTask`; we don't
    // append it here because pty-manager's PTYManager.spawn flow uses
    // the initialTask separately. If the orchestrator wants the task on
    // the command line, it can wrap via the `toOpencodeCommand` helper.
    return args;
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    const env: Record<string, string> = {};
    const credentials = this.getCredentials(config);

    // The orchestrator passes a fully-baked OpenCode config (JSON
    // describing the chosen provider + apiKey + model) via the
    // `OPENCODE_CONFIG_CONTENT` env var. The opencode binary reads that
    // env var ahead of any local config files. The orchestrator's
    // `buildOpencodeSpawnConfig` helper synthesizes this from whatever
    // provider env vars the user has configured (CEREBRAS_API_KEY,
    // OPENROUTER_API_KEY, etc.).
    if (config.env?.OPENCODE_CONFIG_CONTENT) {
      env.OPENCODE_CONFIG_CONTENT = config.env.OPENCODE_CONFIG_CONTENT;
    }

    // Suppress the auto-update check and terminal-title hijack so PTY
    // output stays clean for the orchestrator's parser.
    env.OPENCODE_DISABLE_AUTOUPDATE = '1';
    env.OPENCODE_DISABLE_TERMINAL_TITLE = '1';

    // Forward provider API keys for users who prefer letting OpenCode
    // discover them natively (instead of via OPENCODE_CONFIG_CONTENT).
    // OpenCode's per-provider env-key conventions match the providers'
    // own docs.
    if (credentials.anthropicKey) {
      env.ANTHROPIC_API_KEY = credentials.anthropicKey;
    }
    if (credentials.openaiKey) {
      env.OPENAI_API_KEY = credentials.openaiKey;
      if (credentials.openaiBaseUrl) {
        env.OPENAI_BASE_URL = credentials.openaiBaseUrl;
      }
    }
    if (credentials.googleKey) {
      env.GOOGLE_API_KEY = credentials.googleKey;
      env.GEMINI_API_KEY = credentials.googleKey;
    }

    return env;
  }

  /**
   * OpenCode does not display its own login prompts when an API key is
   * pre-supplied (either via OPENCODE_CONFIG_CONTENT or a provider env
   * var). The bare `opencode auth` CLI exists for interactive setup, but
   * orchestrator-managed sessions never need it — credentials are
   * injected via env at spawn time.
   *
   * Auth-required signals are limited to error banners that surface
   * when an inbound request is rejected (401 / 403 / "invalid api key").
   */
  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    if (
      /no.?provider.?configured|opencode.?auth.?login/i.test(stripped) ||
      /missing.?api.?key|api.?key.?not.?found/i.test(stripped)
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions:
          'OpenCode requires a provider API key. Set OPENCODE_CONFIG_CONTENT or one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY.',
      };
    }

    if (
      /401|403|unauthorized|invalid.?api.?key/i.test(stripped) &&
      /opencode|provider/i.test(stripped)
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions:
          'OpenCode provider rejected credentials. Verify the API key for the selected provider.',
      };
    }

    return { required: false };
  }

  /**
   * `--dangerously-skip-permissions` on `opencode run` short-circuits the
   * usual permission UI, so during normal orchestrator-spawned sessions
   * the adapter rarely encounters blocking prompts. The patterns below
   * cover the residual cases (interactive sessions, or provider auth
   * surfacing mid-run).
   */
  detectBlockingPrompt(output: string): BlockingPromptDetection {
    const stripped = this.stripAnsi(output);

    const loginDetection = this.detectLogin(output);
    if (loginDetection.required) {
      return {
        detected: true,
        type: 'login',
        prompt: loginDetection.instructions,
        canAutoRespond: false,
        instructions: loginDetection.instructions,
      };
    }

    // Permission request from the agent — only appears WITHOUT
    // --dangerously-skip-permissions. Looks like: "! permission requested:
    // external_directory (/home/user/*); auto-rejecting"
    if (/permission requested:\s+\S+/i.test(stripped)) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'OpenCode permission request',
        canAutoRespond: false,
        instructions:
          'OpenCode is asking permission for a tool action. Re-spawn with --dangerously-skip-permissions if this is automation.',
      };
    }

    return super.detectBlockingPrompt(output);
  }

  detectLoading(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const tail = stripped.slice(-600);

    // Active agent loop indicator emitted at the top of every run:
    // "> build · gpt-oss-120b" (provider · model). Stays visible while
    // the agent is iterating. NOTE: BaseCodingAdapter.stripAnsi strips
    // `← → ↑ ↓` as TUI decoration, so we can't rely on opencode's
    // arrow-prefixed tool-call status lines as a separate signal — the
    // build-header line is sufficient on its own.
    if (/^>\s+(build|chat|plan|run)\s+·\s+\S+/im.test(tail)) {
      return true;
    }

    // Tool-call status lines after stripAnsi look like " Write /path"
    // (the `←` arrow is stripped, leaving a leading space). The verb
    // word is the durable signal.
    if (
      /(?:^|\n)\s+(?:Read|Write|Edit|Bash|Glob|Grep|Run|Tool)\s+\S+/.test(tail)
    ) {
      return true;
    }

    return false;
  }

  detectTaskComplete(output: string): boolean {
    const stripped = this.stripAnsi(output);
    if (!stripped.trim()) return false;

    // In `run` mode the session exits naturally after the agent loop
    // completes — the orchestrator's process-exit detection handles the
    // strong signal. As a soft signal, the absence of an active build
    // line PLUS the presence of a terminal response is sufficient.
    if (this.detectLoading(stripped)) {
      return false;
    }

    // Terminal session finished: opencode emits "Wrote file successfully."
    // or a final assistant response when everything completed normally.
    if (
      /Wrote file successfully\.|^Done\.?$|^Finished\.?$/im.test(stripped)
    ) {
      return true;
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const tail = stripped.slice(-400);

    if (!tail.trim()) return false;

    if (this.detectLoading(tail)) {
      return false;
    }

    // Interactive `opencode` TUI prompts with `>` followed by a cursor.
    // In `run` mode this rarely appears (the process exits instead).
    if (/(?:^|\n)\s*>\s*$/m.test(tail)) {
      return true;
    }

    return false;
  }

  parseOutput(output: string): ParsedOutput | null {
    const stripped = this.stripAnsi(output);
    const complete = this.detectTaskComplete(stripped);
    if (!complete) {
      return null;
    }

    // OpenCode's `run` mode prints the agent's final reply as the last
    // non-tool-call block before the process exits. Strip the "> build"
    // header and any "← Write /path" tool lines to isolate user-facing
    // text.
    const content = stripped
      .split('\n')
      .filter((line) => {
        if (/^>\s+(build|chat|plan|run)\s+·/i.test(line)) return false;
        if (/^[←→$]\s+(Read|Write|Edit|Bash|Glob|Grep|Run|Tool)/i.test(line))
          return false;
        if (/^Wrote file successfully\.?$/i.test(line)) return false;
        return true;
      })
      .join('\n')
      .trim();

    return {
      type: this.containsQuestion(content) ? 'question' : 'response',
      content,
      isComplete: true,
      isQuestion: this.containsQuestion(content),
      metadata: { raw: output },
    };
  }

  getPromptPattern(): RegExp {
    return /(?:^|\n)\s*>\s*$/m;
  }

  getHealthCheckCommand(): string {
    return 'opencode --version';
  }
}
