import { describe, it, expect } from 'vitest';
import {
  generateApprovalConfig,
  generateClaudeApprovalConfig,
  generateGeminiApprovalConfig,
  generateCodexApprovalConfig,
  generateAiderApprovalConfig,
  listPresets,
  getPresetDefinition,
  TOOL_CATEGORIES,
  PRESET_DEFINITIONS,
  CLAUDE_TOOL_CATEGORIES,
  GEMINI_TOOL_CATEGORIES,
  CODEX_TOOL_CATEGORIES,
  AIDER_COMMAND_CATEGORIES,
  type ApprovalPreset,
  type ToolCategory,
} from './approval-presets';

// ─────────────────────────────────────────────────────────────────────────────
// Constants and helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PRESETS: ApprovalPreset[] = ['readonly', 'standard', 'permissive', 'autonomous'];
const ALL_CATEGORIES: ToolCategory[] = [
  'file_read', 'file_write', 'shell', 'web', 'agent', 'planning', 'user_interaction',
];

describe('Approval Presets', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // listPresets / getPresetDefinition
  // ─────────────────────────────────────────────────────────────────────────

  describe('listPresets()', () => {
    it('returns all 4 presets', () => {
      const presets = listPresets();
      expect(presets).toHaveLength(4);
      expect(presets.map(p => p.preset)).toEqual(ALL_PRESETS);
    });

    it('returns a copy (not the original array)', () => {
      const a = listPresets();
      const b = listPresets();
      expect(a).not.toBe(b);
    });
  });

  describe('getPresetDefinition()', () => {
    it('returns definition for each preset', () => {
      for (const name of ALL_PRESETS) {
        const def = getPresetDefinition(name);
        expect(def.preset).toBe(name);
        expect(def.description).toBeTruthy();
      }
    });

    it('throws for unknown preset', () => {
      expect(() => getPresetDefinition('nonexistent' as ApprovalPreset)).toThrow('Unknown preset');
    });

    it('every category in autoApprove/requireApproval/blocked is a valid ToolCategory', () => {
      for (const def of PRESET_DEFINITIONS) {
        for (const cat of [...def.autoApprove, ...def.requireApproval, ...def.blocked]) {
          expect(ALL_CATEGORIES).toContain(cat);
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tool category mapping completeness
  // ─────────────────────────────────────────────────────────────────────────

  describe('TOOL_CATEGORIES', () => {
    it('defines all 7 categories', () => {
      expect(TOOL_CATEGORIES).toHaveLength(7);
      expect(TOOL_CATEGORIES.map(t => t.category).sort()).toEqual([...ALL_CATEGORIES].sort());
    });
  });

  describe('per-CLI tool category mappings', () => {
    it('CLAUDE_TOOL_CATEGORIES maps all tools to valid categories', () => {
      for (const cat of Object.values(CLAUDE_TOOL_CATEGORIES)) {
        expect(ALL_CATEGORIES).toContain(cat);
      }
      expect(Object.keys(CLAUDE_TOOL_CATEGORIES).length).toBeGreaterThan(0);
    });

    it('GEMINI_TOOL_CATEGORIES maps all tools to valid categories', () => {
      for (const cat of Object.values(GEMINI_TOOL_CATEGORIES)) {
        expect(ALL_CATEGORIES).toContain(cat);
      }
      expect(Object.keys(GEMINI_TOOL_CATEGORIES).length).toBeGreaterThan(0);
    });

    it('CODEX_TOOL_CATEGORIES maps all tools to valid categories', () => {
      for (const cat of Object.values(CODEX_TOOL_CATEGORIES)) {
        expect(ALL_CATEGORIES).toContain(cat);
      }
      expect(Object.keys(CODEX_TOOL_CATEGORIES).length).toBeGreaterThan(0);
    });

    it('AIDER_COMMAND_CATEGORIES maps all commands to valid categories', () => {
      for (const cat of Object.values(AIDER_COMMAND_CATEGORIES)) {
        expect(ALL_CATEGORIES).toContain(cat);
      }
      expect(Object.keys(AIDER_COMMAND_CATEGORIES).length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // generateApprovalConfig dispatch
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateApprovalConfig()', () => {
    it('dispatches to correct per-CLI generator', () => {
      const claude = generateApprovalConfig('claude', 'standard');
      expect(claude.summary).toContain('Claude Code');

      const gemini = generateApprovalConfig('gemini', 'standard');
      expect(gemini.summary).toContain('Gemini CLI');

      const codex = generateApprovalConfig('codex', 'standard');
      expect(codex.summary).toContain('Codex');

      const aider = generateApprovalConfig('aider', 'standard');
      expect(aider.summary).toContain('Aider');
    });

    it('throws for unknown adapter type', () => {
      expect(() => generateApprovalConfig('unknown' as never, 'standard')).toThrow('Unknown adapter type');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Claude Code config generation (4 presets)
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateClaudeApprovalConfig()', () => {
    it('readonly: blocks write/shell/web tools', () => {
      const config = generateClaudeApprovalConfig('readonly');
      expect(config.preset).toBe('readonly');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.permissions.allow).toContain('Read');
      expect(settings.permissions.allow).toContain('Grep');
      expect(settings.permissions.deny).toContain('Write');
      expect(settings.permissions.deny).toContain('Bash');
      expect(settings.permissions.deny).toContain('WebSearch');
      expect(config.cliFlags).toEqual([]);
    });

    it('standard: allows read + web, no deny list', () => {
      const config = generateClaudeApprovalConfig('standard');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.permissions.allow).toContain('Read');
      expect(settings.permissions.allow).toContain('WebSearch');
      expect(settings.permissions.deny).toBeUndefined();
    });

    it('permissive: allows read + write + web + agent, no deny', () => {
      const config = generateClaudeApprovalConfig('permissive');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.permissions.allow).toContain('Write');
      expect(settings.permissions.allow).toContain('Edit');
      expect(settings.permissions.allow).toContain('Skill');
      expect(settings.permissions.deny).toBeUndefined();
    });

    it('autonomous: enables sandbox, adds --tools flag', () => {
      const config = generateClaudeApprovalConfig('autonomous');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.sandbox?.enabled).toBe(true);
      expect(settings.sandbox?.autoAllowBashIfSandboxed).toBe(true);
      expect(settings.permissions.allow).toContain('Bash');
      expect(config.cliFlags).toContain('--tools');
    });

    it('writes to .claude/settings.json', () => {
      const config = generateClaudeApprovalConfig('standard');
      expect(config.workspaceFiles[0].relativePath).toBe('.claude/settings.json');
      expect(config.workspaceFiles[0].format).toBe('json');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Gemini CLI config generation (4 presets)
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateGeminiApprovalConfig()', () => {
    it('readonly: plan mode, excludes write/shell tools', () => {
      const config = generateGeminiApprovalConfig('readonly');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.general.defaultApprovalMode).toBe('plan');
      expect(settings.tools.exclude).toContain('write_file');
      expect(settings.tools.exclude).toContain('run_shell_command');
      expect(config.cliFlags).toContain('--approval-mode');
      expect(config.cliFlags).toContain('plan');
    });

    it('standard: default mode', () => {
      const config = generateGeminiApprovalConfig('standard');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.general.defaultApprovalMode).toBe('default');
      expect(config.cliFlags).toEqual([]);
    });

    it('permissive: auto_edit mode', () => {
      const config = generateGeminiApprovalConfig('permissive');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.general.defaultApprovalMode).toBe('auto_edit');
      expect(config.cliFlags).toContain('auto_edit');
    });

    it('autonomous: auto_edit with -y flag', () => {
      const config = generateGeminiApprovalConfig('autonomous');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.general.defaultApprovalMode).toBe('auto_edit');
      expect(config.cliFlags).toContain('-y');
    });

    it('writes to .gemini/settings.json', () => {
      const config = generateGeminiApprovalConfig('standard');
      expect(config.workspaceFiles[0].relativePath).toBe('.gemini/settings.json');
      expect(config.workspaceFiles[0].format).toBe('json');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Codex config generation (4 presets)
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateCodexApprovalConfig()', () => {
    it('readonly: untrusted policy, workspace-read sandbox, no web search', () => {
      const config = generateCodexApprovalConfig('readonly');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.approval_policy).toBe('untrusted');
      expect(settings.sandbox_mode).toBe('workspace-read');
      expect(settings.tools.web_search).toBe(false);
      expect(config.cliFlags).toContain('--sandbox');
      expect(config.cliFlags).toContain('workspace-read');
    });

    it('standard: on-failure policy, workspace-write sandbox', () => {
      const config = generateCodexApprovalConfig('standard');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.approval_policy).toBe('on-failure');
      expect(settings.sandbox_mode).toBe('workspace-write');
      expect(settings.tools.web_search).toBe(true);
      expect(config.cliFlags).toContain('--sandbox');
      expect(config.cliFlags).toContain('workspace-write');
    });

    it('permissive: on-request policy', () => {
      const config = generateCodexApprovalConfig('permissive');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.approval_policy).toBe('on-request');
      expect(config.cliFlags).toContain('-a');
      expect(config.cliFlags).toContain('on-request');
    });

    it('autonomous: --full-auto flag', () => {
      const config = generateCodexApprovalConfig('autonomous');
      const settings = JSON.parse(config.workspaceFiles[0].content);
      expect(settings.approval_policy).toBe('never');
      expect(config.cliFlags).toContain('--full-auto');
    });

    it('writes to .codex/config.json', () => {
      const config = generateCodexApprovalConfig('standard');
      expect(config.workspaceFiles[0].relativePath).toBe('.codex/config.json');
      expect(config.workspaceFiles[0].format).toBe('json');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Aider config generation (4 presets)
  // ─────────────────────────────────────────────────────────────────────────

  describe('generateAiderApprovalConfig()', () => {
    it('readonly: no auto-commits, no yes-always', () => {
      const config = generateAiderApprovalConfig('readonly');
      const content = config.workspaceFiles[0].content;
      expect(content).toContain('yes-always: false');
      expect(content).toContain('no-auto-commits: true');
      expect(config.cliFlags).toContain('--no-auto-commits');
    });

    it('standard: no yes-always, no extra flags', () => {
      const config = generateAiderApprovalConfig('standard');
      const content = config.workspaceFiles[0].content;
      expect(content).toContain('yes-always: false');
      expect(config.cliFlags).toEqual([]);
    });

    it('permissive: yes-always enabled', () => {
      const config = generateAiderApprovalConfig('permissive');
      const content = config.workspaceFiles[0].content;
      expect(content).toContain('yes-always: true');
      expect(config.cliFlags).toContain('--yes-always');
    });

    it('autonomous: yes-always enabled', () => {
      const config = generateAiderApprovalConfig('autonomous');
      const content = config.workspaceFiles[0].content;
      expect(content).toContain('yes-always: true');
      expect(config.cliFlags).toContain('--yes-always');
    });

    it('writes to .aider.conf.yml', () => {
      const config = generateAiderApprovalConfig('standard');
      expect(config.workspaceFiles[0].relativePath).toBe('.aider.conf.yml');
      expect(config.workspaceFiles[0].format).toBe('yaml');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-cutting validation
  // ─────────────────────────────────────────────────────────────────────────

  describe('all configs', () => {
    const adapters = ['claude', 'gemini', 'codex', 'aider'] as const;

    for (const adapter of adapters) {
      for (const preset of ALL_PRESETS) {
        it(`${adapter}/${preset}: returns valid ApprovalConfig`, () => {
          const config = generateApprovalConfig(adapter, preset);
          expect(config.preset).toBe(preset);
          expect(config.summary).toBeTruthy();
          expect(Array.isArray(config.cliFlags)).toBe(true);
          expect(Array.isArray(config.workspaceFiles)).toBe(true);
          expect(config.workspaceFiles.length).toBeGreaterThan(0);
          expect(typeof config.envVars).toBe('object');

          // Workspace file content should be valid for its format
          for (const file of config.workspaceFiles) {
            expect(file.relativePath).toBeTruthy();
            expect(file.content).toBeTruthy();
            if (file.format === 'json') {
              expect(() => JSON.parse(file.content)).not.toThrow();
            }
          }
        });
      }
    }
  });
});
