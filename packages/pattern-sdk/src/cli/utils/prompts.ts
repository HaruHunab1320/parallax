/**
 * Interactive prompts for CLI
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { OrchestrationRequirements } from '../../types';

/**
 * Interactive prompt for pattern generation
 */
export async function interactivePatternPrompt(): Promise<OrchestrationRequirements> {
  console.log(chalk.bold('\n🎯 Pattern Generation Wizard\n'));
  
  const basicAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'goal',
      message: 'What is the main goal of this orchestration?',
      validate: (input) => input.length > 0 || 'Goal is required'
    },
    {
      type: 'list',
      name: 'strategy',
      message: 'What orchestration strategy should be used?',
      choices: [
        { name: 'Auto-detect (recommended)', value: null },
        { name: 'Consensus - Multiple agents reach agreement', value: 'consensus' },
        { name: 'Pipeline - Sequential processing stages', value: 'pipeline' },
        { name: 'Parallel - Concurrent execution', value: 'parallel' },
        { name: 'Hierarchical - Tiered decision making', value: 'hierarchical' }
      ]
    },
    {
      type: 'number',
      name: 'minConfidence',
      message: 'Minimum confidence threshold (0-1):',
      default: 0.7,
      validate: (input) => (input >= 0 && input <= 1) || 'Must be between 0 and 1'
    },
    {
      type: 'confirm',
      name: 'hasFallback',
      message: 'Should there be a fallback for low confidence?',
      default: true
    }
  ]);
  
  let fallback: string | undefined;
  if (basicAnswers.hasFallback) {
    const fallbackAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'fallback',
        message: 'Fallback target (e.g., senior-expert, human):',
        default: 'human'
      }
    ]);
    fallback = fallbackAnswer.fallback;
  }
  
  // Ask about stages
  const { hasStages } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasStages',
      message: 'Does this pattern have multiple stages?',
      default: false
    }
  ]);
  
  const stages = [];
  if (hasStages) {
    let addingStages = true;
    while (addingStages) {
      console.log(chalk.gray(`\nStage ${stages.length + 1}:`));
      
      const stageAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Stage name:',
          validate: (input) => input.length > 0 || 'Name is required'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Stage description (optional):'
        },
        {
          type: 'confirm',
          name: 'parallel',
          message: 'Execute agents in parallel?',
          default: true
        },
        {
          type: 'input',
          name: 'capability',
          message: 'Required agent capability:',
          validate: (input) => input.length > 0 || 'Capability is required'
        },
        {
          type: 'number',
          name: 'count',
          message: 'Number of agents:',
          default: 1,
          validate: (input) => input > 0 || 'Must be at least 1'
        }
      ]);
      
      stages.push({
        name: stageAnswers.name,
        description: stageAnswers.description || undefined,
        parallel: stageAnswers.parallel,
        agents: [{
          capability: stageAnswers.capability,
          count: stageAnswers.count
        }]
      });
      
      const { continueAdding } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueAdding',
          message: 'Add another stage?',
          default: false
        }
      ]);
      
      addingStages = continueAdding;
    }
  }
  
  // Ask about constraints
  const { hasConstraints } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasConstraints',
      message: 'Add any constraints or additional configuration?',
      default: false
    }
  ]);
  
  let constraints: Record<string, any> = {};
  if (hasConstraints) {
    const constraintAnswers = await inquirer.prompt([
      {
        type: 'number',
        name: 'timeout',
        message: 'Timeout in seconds (0 for none):',
        default: 0
      },
      {
        type: 'number',
        name: 'maxRetries',
        message: 'Maximum retry attempts:',
        default: 3
      },
      {
        type: 'confirm',
        name: 'cacheResults',
        message: 'Cache results?',
        default: false
      }
    ]);
    
    if (constraintAnswers.timeout > 0) {
      constraints.timeout = constraintAnswers.timeout;
    }
    constraints.maxRetries = constraintAnswers.maxRetries;
    constraints.cacheResults = constraintAnswers.cacheResults;
  }
  
  // Build requirements
  const requirements: OrchestrationRequirements = {
    goal: basicAnswers.goal,
    strategy: basicAnswers.strategy || undefined,
    minConfidence: basicAnswers.minConfidence,
    fallback,
    stages: stages.length > 0 ? stages : undefined,
    constraints: Object.keys(constraints).length > 0 ? constraints : undefined
  };
  
  // Show summary
  console.log(chalk.bold('\n📋 Pattern Summary:\n'));
  console.log(chalk.gray('Goal:'), requirements.goal);
  console.log(chalk.gray('Strategy:'), requirements.strategy || 'auto-detect');
  console.log(chalk.gray('Min Confidence:'), requirements.minConfidence);
  if (requirements.fallback) {
    console.log(chalk.gray('Fallback:'), requirements.fallback);
  }
  if (requirements.stages) {
    console.log(chalk.gray('Stages:'), requirements.stages.length);
  }
  
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '\nGenerate pattern with these requirements?',
      default: true
    }
  ]);
  
  if (!confirm) {
    console.log(chalk.yellow('Pattern generation cancelled'));
    process.exit(0);
  }
  
  return requirements;
}

/**
 * Prompt for LLM provider selection
 */
export async function selectLLMProvider() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select LLM provider:',
      choices: [
        { name: 'OpenAI', value: 'openai' },
        { name: 'Anthropic', value: 'anthropic' },
        { name: 'Gemini', value: 'gemini' },
        { name: 'Custom', value: 'custom' }
      ]
    }
  ]);
  
  return answers.provider;
}
