import { describe, expect, it } from 'vitest';

import type { AdapterType } from '../base-coding-adapter';
import {
  type ApprovalConfig,
  type ApprovalPreset,
  CLAUDE_TOOL_CATEGORIES,
  generateApprovalConfig,
  generateClaudeApprovalConfig,
  generateCodexApprovalConfig,
  getPresetDefinition,
  listPresets,
  PRESET_DEFINITIONS,
} from '../approval-presets';

const AGENT_TYPES: AdapterType[] = ['claude', 'codex', 'gemini', 'aider'];
const PRESETS: ApprovalPreset[] = [
  'readonly',
  'standard',
  'permissive',
  'autonomous',
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. generateApprovalConfig — every agent x preset combination
// ─────────────────────────────────────────────────────────────────────────────

describe('generateApprovalConfig', () => {
  for (const agentType of AGENT_TYPES) {
    for (const preset of PRESETS) {
      it(`returns valid ApprovalConfig for ${agentType} / ${preset}`, () => {
        const config = generateApprovalConfig(agentType, preset);

        // Shape checks
        expect(config).toHaveProperty('preset', preset);
        expect(config).toHaveProperty('cliFlags');
        expect(config).toHaveProperty('workspaceFiles');
        expect(config).toHaveProperty('envVars');
        expect(config).toHaveProperty('summary');

        // cliFlags is string[]
        expect(Array.isArray(config.cliFlags)).toBe(true);
        for (const flag of config.cliFlags) {
          expect(typeof flag).toBe('string');
        }

        // workspaceFiles has relativePath and content
        expect(Array.isArray(config.workspaceFiles)).toBe(true);
        for (const file of config.workspaceFiles) {
          expect(file).toHaveProperty('relativePath');
          expect(file).toHaveProperty('content');
          expect(typeof file.relativePath).toBe('string');
          expect(typeof file.content).toBe('string');
        }

        // envVars is an object
        expect(typeof config.envVars).toBe('object');

        // summary is a non-empty string
        expect(typeof config.summary).toBe('string');
        expect(config.summary.length).toBeGreaterThan(0);
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Claude-specific preset tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Claude-specific presets', () => {
  it('autonomous includes --dangerously-skip-permissions', () => {
    const config = generateApprovalConfig('claude', 'autonomous');
    expect(config.cliFlags).toContain('--dangerously-skip-permissions');
  });

  it('autonomous includes --tools flag with tool list', () => {
    const config = generateApprovalConfig('claude', 'autonomous');
    const toolsIdx = config.cliFlags.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThanOrEqual(0);

    const toolList = config.cliFlags[toolsIdx + 1];
    expect(typeof toolList).toBe('string');

    // Should contain all Claude tool names
    const allTools = Object.keys(CLAUDE_TOOL_CATEGORIES);
    const passedTools = toolList.split(',');
    expect(passedTools).toEqual(expect.arrayContaining(allTools));
  });

  it('autonomous workspaceFiles includes .claude/settings.json with sandbox config', () => {
    const config = generateClaudeApprovalConfig('autonomous');
    const settingsFile = config.workspaceFiles.find(
      (f) => f.relativePath === '.claude/settings.json'
    );
    expect(settingsFile).toBeDefined();

    const parsed = JSON.parse(settingsFile!.content);
    expect(parsed.sandbox).toBeDefined();
    expect(parsed.sandbox.enabled).toBe(true);
    expect(parsed.sandbox.autoAllowBashIfSandboxed).toBe(true);
  });

  it('readonly does NOT include dangerous flags', () => {
    const config = generateApprovalConfig('claude', 'readonly');
    expect(config.cliFlags).not.toContain('--dangerously-skip-permissions');
    expect(config.cliFlags).not.toContain('--tools');
    expect(config.cliFlags).not.toContain('--full-auto');
  });

  it('readonly blocks file_write, shell, web, and agent tools', () => {
    const config = generateClaudeApprovalConfig('readonly');
    const settingsFile = config.workspaceFiles.find(
      (f) => f.relativePath === '.claude/settings.json'
    );
    expect(settingsFile).toBeDefined();

    const parsed = JSON.parse(settingsFile!.content);
    expect(parsed.permissions.deny).toBeDefined();
    expect(parsed.permissions.deny.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Codex-specific tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Codex-specific presets', () => {
  it('autonomous includes --full-auto flag', () => {
    const config = generateApprovalConfig('codex', 'autonomous');
    expect(config.cliFlags).toContain('--full-auto');
  });

  it('generates .codex/config.json with correct structure', () => {
    const config = generateCodexApprovalConfig('standard');
    const configFile = config.workspaceFiles.find(
      (f) => f.relativePath === '.codex/config.json'
    );
    expect(configFile).toBeDefined();

    const parsed = JSON.parse(configFile!.content);
    expect(parsed).toHaveProperty('approval_policy');
    expect(parsed).toHaveProperty('sandbox_mode');
    expect(parsed).toHaveProperty('tools');
  });

  it('readonly sets sandbox to workspace-read', () => {
    const config = generateCodexApprovalConfig('readonly');
    const parsed = JSON.parse(config.workspaceFiles[0].content);
    expect(parsed.sandbox_mode).toBe('workspace-read');
    expect(parsed.approval_policy).toBe('untrusted');
  });

  it('autonomous sets approval_policy to never', () => {
    const config = generateCodexApprovalConfig('autonomous');
    const parsed = JSON.parse(config.workspaceFiles[0].content);
    expect(parsed.approval_policy).toBe('never');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. getPresetDefinition
// ─────────────────────────────────────────────────────────────────────────────

describe('getPresetDefinition', () => {
  for (const preset of PRESETS) {
    it(`returns correct definition for "${preset}"`, () => {
      const def = getPresetDefinition(preset);

      expect(def).toHaveProperty('preset', preset);
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('autoApprove');
      expect(def).toHaveProperty('requireApproval');
      expect(def).toHaveProperty('blocked');

      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);

      expect(Array.isArray(def.autoApprove)).toBe(true);
      expect(Array.isArray(def.requireApproval)).toBe(true);
      expect(Array.isArray(def.blocked)).toBe(true);
    });
  }

  it('readonly blocks file_write, shell, web, agent', () => {
    const def = getPresetDefinition('readonly');
    expect(def.blocked).toContain('file_write');
    expect(def.blocked).toContain('shell');
    expect(def.blocked).toContain('web');
    expect(def.blocked).toContain('agent');
  });

  it('autonomous auto-approves everything and blocks nothing', () => {
    const def = getPresetDefinition('autonomous');
    expect(def.blocked).toHaveLength(0);
    expect(def.requireApproval).toHaveLength(0);
    expect(def.autoApprove.length).toBeGreaterThan(0);
  });

  it('throws for unknown preset', () => {
    expect(() =>
      getPresetDefinition('nonexistent' as ApprovalPreset)
    ).toThrow('Unknown preset');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('unknown agent type throws an error', () => {
    expect(() =>
      generateApprovalConfig('unknown-agent' as AdapterType, 'standard')
    ).toThrow('Unknown adapter type');
  });

  it('all presets have non-empty descriptions', () => {
    const presets = listPresets();
    expect(presets.length).toBe(4);
    for (const def of presets) {
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('listPresets returns a copy (not the original array)', () => {
    const a = listPresets();
    const b = listPresets();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('PRESET_DEFINITIONS covers all four presets', () => {
    const presetNames = PRESET_DEFINITIONS.map((d) => d.preset);
    expect(presetNames).toContain('readonly');
    expect(presetNames).toContain('standard');
    expect(presetNames).toContain('permissive');
    expect(presetNames).toContain('autonomous');
  });

  it('hermes returns empty cliFlags and workspaceFiles for all presets', () => {
    for (const preset of PRESETS) {
      const config = generateApprovalConfig('hermes', preset);
      expect(config.cliFlags).toEqual([]);
      expect(config.workspaceFiles).toEqual([]);
    }
  });
});
