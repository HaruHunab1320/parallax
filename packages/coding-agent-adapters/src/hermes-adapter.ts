/**
 * Hermes Agent CLI Adapter
 *
 * Adapter for the Hermes Agent CLI tool.
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

export class HermesAdapter extends BaseCodingAdapter {
  readonly adapterType = 'hermes';
  readonly displayName = 'Hermes Agent';

  /** Prompt-toolkit TUI + spinner rendering needs a slightly longer settle. */
  override readonly readySettleMs: number = 400;

  readonly installation: InstallationInfo = {
    command: 'pip install "hermes-agent[cli]"',
    alternatives: [
      'pipx install "hermes-agent[cli]"',
      'uv tool install "hermes-agent[cli]"',
    ],
    docsUrl: 'https://github.com/NousResearch/hermes-agent',
  };

  getWorkspaceFiles(): AgentFileDescriptor[] {
    return [
      {
        relativePath: 'AGENTS.md',
        description:
          'Project instructions and architecture notes loaded by Hermes context files',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: 'SOUL.md',
        description:
          'Optional persona/context file auto-injected into Hermes system prompt',
        autoLoaded: true,
        type: 'memory',
        format: 'markdown',
      },
      {
        relativePath: 'cli-config.yaml',
        description: 'Legacy/local Hermes CLI configuration file',
        autoLoaded: true,
        type: 'config',
        format: 'yaml',
      },
    ];
  }

  getRecommendedModels(_credentials?: AgentCredentials): ModelRecommendations {
    return {
      powerful: 'anthropic/claude-opus-4.6',
      fast: 'google/gemini-3-flash-preview',
    };
  }

  getCommand(): string {
    return 'hermes';
  }

  getArgs(_config: SpawnConfig): string[] {
    // Force chat mode so startup behavior is consistent with the interactive CLI.
    return ['chat'];
  }

  getEnv(config: SpawnConfig): Record<string, string> {
    const env: Record<string, string> = {};
    const credentials = this.getCredentials(config);

    if (credentials.openaiKey) {
      // Hermes primarily uses OpenRouter credentials in CLI mode.
      env.OPENROUTER_API_KEY = credentials.openaiKey;
      env.OPENAI_API_KEY = credentials.openaiKey;
    }
    if (credentials.anthropicKey) {
      env.ANTHROPIC_API_KEY = credentials.anthropicKey;
    }
    if (credentials.googleKey) {
      env.GOOGLE_API_KEY = credentials.googleKey;
      env.GEMINI_API_KEY = credentials.googleKey;
    }

    if (!this.isInteractive(config)) {
      env.HERMES_QUIET = '1';
    }

    return env;
  }

  detectLogin(output: string): LoginDetection {
    const stripped = this.stripAnsi(output);

    if (
      /isn.?t configured yet/i.test(stripped) ||
      /no api keys or providers found/i.test(stripped) ||
      /run setup now\?\s*\[y\/n\]/i.test(stripped)
    ) {
      return {
        required: true,
        type: 'api_key',
        instructions: 'Hermes requires provider credentials. Run: hermes setup',
      };
    }

    return { required: false };
  }

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

    if (/Hermes needs your input|Other \(type your answer\)/i.test(stripped)) {
      return {
        detected: true,
        type: 'tool_wait',
        prompt: 'Hermes clarify prompt',
        canAutoRespond: false,
        instructions:
          'Hermes is waiting for clarify input (arrow keys + Enter or free text).',
      };
    }

    if (
      /Sudo Password Required|password hidden|Password \(hidden\):/i.test(
        stripped
      )
    ) {
      return {
        detected: true,
        type: 'tool_wait',
        prompt: 'Hermes sudo password prompt',
        canAutoRespond: false,
        instructions:
          'Hermes terminal tool is waiting for a sudo password or skip.',
      };
    }

    if (
      /Dangerous Command|Allow once|Allow for this session|permanent allowlist|\bDeny\b/i.test(
        stripped
      )
    ) {
      return {
        detected: true,
        type: 'permission',
        prompt: 'Hermes dangerous command approval',
        canAutoRespond: false,
        instructions: 'Choose approval policy (once/session/always/deny).',
      };
    }

    return super.detectBlockingPrompt(output);
  }

  detectLoading(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const tail = stripped.slice(-1200);

    // Thinking spinner verbs from agent/display.py
    if (
      /(?:pondering|contemplating|musing|cogitating|ruminating|deliberating|mulling|reflecting|processing|reasoning|analyzing|computing|synthesizing|formulating|brainstorming)\.\.\.\s*\(\d+\.\d+s\)/i.test(
        tail
      )
    ) {
      return true;
    }

    // Tool spinner / active progress line with elapsed time.
    if (
      /\(\d+\.\d+s\)\s*$/.test(tail) &&
      /(?:🔍|📄|💻|⚙️|📖|✍️|🔧|🌐|👆|⌨️|📋|🧠|📚|🎨|🐍|🔀|⚡|💬)/.test(tail)
    ) {
      return true;
    }

    // Prompt in working state.
    if (/⚕\s*❯\s*$/.test(tail)) {
      return true;
    }

    return false;
  }

  detectTaskComplete(output: string): boolean {
    // Check raw output first because stripAnsi removes box-drawing chars.
    if (/╭─\s*⚕\s*Hermes/i.test(output)) {
      return true;
    }

    const stripped = this.stripAnsi(output);
    if (!stripped.trim()) return false;

    if (this.detectLoading(stripped)) {
      return false;
    }

    const hasIdlePrompt = /(?:^|\n)\s*❯\s*$/m.test(stripped);
    const hasToolFeed = /(?:^|\n)\s*┊\s+\S+/m.test(stripped);

    if (hasIdlePrompt && hasToolFeed) {
      return true;
    }

    return false;
  }

  detectReady(output: string): boolean {
    const stripped = this.stripAnsi(output);
    const tail = stripped.slice(-800);

    if (!tail.trim()) return false;

    if (this.detectLoading(tail)) {
      return false;
    }

    if (
      /Hermes needs your input|Sudo Password Required|Dangerous Command/i.test(
        tail
      )
    ) {
      return false;
    }

    if (/(?:⚕|⚠|🔐|\?|✎)\s*❯\s*$/.test(tail)) {
      return false;
    }

    return /(?:^|\n)\s*❯\s*$/m.test(tail);
  }

  parseOutput(output: string): ParsedOutput | null {
    const raw = output;
    const stripped = this.stripAnsi(output);

    const complete = this.detectTaskComplete(raw) || this.detectReady(stripped);
    if (!complete) {
      return null;
    }

    let content = '';

    // Final response box emitted by the Hermes CLI.
    const boxMatch = raw.match(/╭─\s*⚕\s*Hermes[^\n]*\n([\s\S]*?)\n\s*╰/i);
    if (boxMatch?.[1]) {
      content = boxMatch[1].trim();
    }

    // Fallback: keep tail content with prompts stripped.
    if (!content) {
      content = this.extractContent(
        stripped,
        /(?:^|\n)\s*(?:⚕|⚠|🔐|\?|✎)?\s*❯\s*$/gim
      );
    }

    return {
      type: this.containsQuestion(content) ? 'question' : 'response',
      content,
      isComplete: true,
      isQuestion: this.containsQuestion(content),
      metadata: {
        raw: output,
      },
    };
  }

  getPromptPattern(): RegExp {
    return /(?:^|\n)\s*(?:⚕|⚠|🔐|\?|✎)?\s*❯\s*$/i;
  }

  override detectExit(output: string): {
    exited: boolean;
    code?: number;
    error?: string;
  } {
    const stripped = this.stripAnsi(output);

    if (/Goodbye!\s*⚕/i.test(stripped)) {
      return { exited: true, code: 0 };
    }

    return super.detectExit(output);
  }

  getHealthCheckCommand(): string {
    return 'hermes version';
  }
}
