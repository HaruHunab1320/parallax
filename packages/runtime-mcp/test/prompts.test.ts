import { describe, it, expect } from 'vitest';
import {
  generateSpawnReviewTeamPrompt,
  generateSpawnDevAgentPrompt,
  SPAWN_REVIEW_TEAM_PROMPT,
  SPAWN_DEV_AGENT_PROMPT,
} from '../src/prompts/index.js';

describe('Prompt Definitions', () => {
  describe('SPAWN_REVIEW_TEAM_PROMPT', () => {
    it('should have correct name', () => {
      expect(SPAWN_REVIEW_TEAM_PROMPT.name).toBe('spawn_review_team');
    });

    it('should have description', () => {
      expect(SPAWN_REVIEW_TEAM_PROMPT.description).toBeDefined();
      expect(SPAWN_REVIEW_TEAM_PROMPT.description.length).toBeGreaterThan(0);
    });

    it('should have required arguments', () => {
      expect(SPAWN_REVIEW_TEAM_PROMPT.arguments).toHaveLength(2);

      const projectDir = SPAWN_REVIEW_TEAM_PROMPT.arguments.find(a => a.name === 'project_dir');
      expect(projectDir).toBeDefined();
      expect(projectDir!.required).toBe(true);

      const reviewFocus = SPAWN_REVIEW_TEAM_PROMPT.arguments.find(a => a.name === 'review_focus');
      expect(reviewFocus).toBeDefined();
      expect(reviewFocus!.required).toBe(false);
    });
  });

  describe('SPAWN_DEV_AGENT_PROMPT', () => {
    it('should have correct name', () => {
      expect(SPAWN_DEV_AGENT_PROMPT.name).toBe('spawn_dev_agent');
    });

    it('should have required arguments', () => {
      expect(SPAWN_DEV_AGENT_PROMPT.arguments).toHaveLength(3);

      const task = SPAWN_DEV_AGENT_PROMPT.arguments.find(a => a.name === 'task');
      expect(task!.required).toBe(true);

      const projectDir = SPAWN_DEV_AGENT_PROMPT.arguments.find(a => a.name === 'project_dir');
      expect(projectDir!.required).toBe(true);

      const agentType = SPAWN_DEV_AGENT_PROMPT.arguments.find(a => a.name === 'agent_type');
      expect(agentType!.required).toBe(false);
    });
  });
});

describe('Prompt Generation', () => {
  describe('generateSpawnReviewTeamPrompt', () => {
    it('should generate prompt with project directory', () => {
      const result = generateSpawnReviewTeamPrompt({
        project_dir: '/path/to/project',
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(result.messages[0].content.text).toContain('/path/to/project');
    });

    it('should include review focus when provided', () => {
      const result = generateSpawnReviewTeamPrompt({
        project_dir: '/project',
        review_focus: 'security',
      });

      expect(result.messages[0].content.text).toContain('security');
    });

    it('should default to "all" focus when not provided', () => {
      const result = generateSpawnReviewTeamPrompt({
        project_dir: '/project',
      });

      expect(result.messages[0].content.text).toContain('Review Focus: all');
    });

    it('should mention all three agent roles', () => {
      const result = generateSpawnReviewTeamPrompt({
        project_dir: '/project',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('Architect');
      expect(text).toContain('Reviewer');
      expect(text).toContain('Test Engineer');
    });

    it('should include spawn instructions', () => {
      const result = generateSpawnReviewTeamPrompt({
        project_dir: '/project',
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('spawn');
      expect(text).toContain('Capabilities'); // Note: capitalized in the output
    });
  });

  describe('generateSpawnDevAgentPrompt', () => {
    it('should generate prompt with task', () => {
      const result = generateSpawnDevAgentPrompt({
        task: 'Fix the login bug',
        project_dir: '/project',
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain('Fix the login bug');
      expect(result.messages[0].content.text).toContain('/project');
    });

    it('should default to claude agent type', () => {
      const result = generateSpawnDevAgentPrompt({
        task: 'Some task',
        project_dir: '/project',
      });

      expect(result.messages[0].content.text).toContain('claude');
    });

    it('should use specified agent type', () => {
      const result = generateSpawnDevAgentPrompt({
        task: 'Some task',
        project_dir: '/project',
        agent_type: 'codex',
      });

      expect(result.messages[0].content.text).toContain('codex');
    });

    it('should infer capabilities from task keywords', () => {
      const bugResult = generateSpawnDevAgentPrompt({
        task: 'Fix a bug in the code',
        project_dir: '/project',
      });
      expect(bugResult.messages[0].content.text).toContain('debugging');

      const testResult = generateSpawnDevAgentPrompt({
        task: 'Write unit tests',
        project_dir: '/project',
      });
      expect(testResult.messages[0].content.text).toContain('testing');

      const refactorResult = generateSpawnDevAgentPrompt({
        task: 'Refactor the authentication module',
        project_dir: '/project',
      });
      expect(refactorResult.messages[0].content.text).toContain('refactoring');
    });

    it('should generate meaningful agent name from task', () => {
      const result = generateSpawnDevAgentPrompt({
        task: 'Add user authentication',
        project_dir: '/project',
      });

      // Agent name should be derived from task
      expect(result.messages[0].content.text).toContain('dev-');
    });

    it('should always include code_writing capability', () => {
      const result = generateSpawnDevAgentPrompt({
        task: 'Simple task',
        project_dir: '/project',
      });

      expect(result.messages[0].content.text).toContain('code_writing');
    });
  });
});
