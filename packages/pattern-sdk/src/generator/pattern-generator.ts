/**
 * Pattern Generator - Core logic for generating patterns from requirements
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import {
  OrchestrationRequirements,
  OrchestrationRequirementsSchema,
  Pattern,
  GeneratorOptions,
  LLMProvider,
  RequirementsAnalysisSchema,
  PrimitiveSelectionSchema,
  PrimitiveDefinition
} from '../types';
import { loadPrimitivesSync as loadPrimitives } from '../primitives/primitive-loader';
import { PatternAssembler } from './pattern-assembler';
import { PatternValidator } from '../validator/pattern-validator';
import { formatPatternName } from '../utils/naming';

export class PatternGenerator {
  private llm: LLMProvider;
  private outputDir: string;
  private primitives: Map<string, PrimitiveDefinition>;
  private assembler: PatternAssembler;
  private validator: PatternValidator;

  constructor(llmOrOptions: LLMProvider | GeneratorOptions) {
    // Support both simple LLM provider and full options
    if ('generateObject' in llmOrOptions) {
      // Simple LLM provider passed
      this.llm = llmOrOptions;
      this.outputDir = './patterns';
      this.primitives = loadPrimitives();
    } else {
      // Full options passed
      this.llm = llmOrOptions.llm;
      this.outputDir = llmOrOptions.outputDir || './patterns';
      this.primitives = loadPrimitives(llmOrOptions.primitivesPath);
    }
    
    this.assembler = new PatternAssembler(this.primitives);
    this.validator = new PatternValidator();
  }

  /**
   * Generate a pattern from requirements string (CLI-friendly interface)
   */
  async generatePattern(requirementsText: string, options?: {
    template?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string> {
    // Parse requirements from text
    const requirements = await this.parseRequirements(requirementsText, options?.template);
    
    // Generate the pattern
    const pattern = await this.generate(requirements);
    
    // Return the pattern code as YAML
    return this.formatPatternAsYAML(pattern);
  }

  /**
   * Generate a pattern from requirements
   */
  async generate(requirements: OrchestrationRequirements): Promise<Pattern> {
    console.log('🎯 Analyzing orchestration requirements...');
    
    // 1. Analyze requirements
    const analysis = await this.analyzeRequirements(requirements);
    
    console.log('🔍 Selecting appropriate primitives...');
    
    // 2. Select primitives based on analysis
    const selection = await this.selectPrimitives(requirements, analysis);
    
    console.log('🔨 Assembling pattern...');
    
    // 3. Assemble pattern from selected primitives
    const code = await this.assembler.assemble(
      requirements,
      selection.selected || [],
      selection.order || []
    );
    
    // 4. Create pattern object
    const pattern: Pattern = {
      name: formatPatternName(requirements.goal),
      version: '1.0.0',
      description: requirements.goal,
      code,
      metadata: {
        generated: new Date().toISOString(),
        generator: '@parallax/pattern-sdk',
        primitives: (selection.selected || []).map(s => s.name),
        complexity: this.calculateComplexity(selection.selected || []),
        estimatedAgents: this.estimateAgentCount(requirements)
      },
      requirements
    };
    
    console.log('✅ Pattern generated successfully!');
    
    return pattern;
  }

  /**
   * Save pattern to file
   */
  async save(pattern: Pattern, customPath?: string): Promise<string> {
    await fs.ensureDir(this.outputDir);
    
    const filename = customPath || path.join(
      this.outputDir,
      `${pattern.name}.prism`
    );
    
    // Add metadata as comments - using // format for Prism
    const fileContent = `// Pattern: ${pattern.name}
// Version: ${pattern.version}
// Description: ${pattern.description}
// Generated: ${pattern.metadata.generated}
// Generator: ${pattern.metadata.generator}
// Primitives: ${pattern.metadata.primitives.join(', ')}

${pattern.code}`;
    
    await fs.writeFile(filename, fileContent, 'utf8');
    console.log(`💾 Pattern saved to: ${filename}`);
    
    return filename;
  }

  /**
   * Validate a pattern
   */
  async validate(pattern: Pattern) {
    return this.validator.validate(pattern);
  }
  
  /**
   * Auto-fix common validation issues
   */
  async autoFix(pattern: Pattern): Promise<Pattern> {
    return this.validator.autoFix(pattern);
  }

  /**
   * Analyze requirements to understand orchestration needs
   */
  private async analyzeRequirements(requirements: OrchestrationRequirements) {
    const prompt = `
Analyze these orchestration requirements and determine what primitives are needed:

Goal: ${requirements.goal}
Strategy: ${requirements.strategy || 'auto-detect'}
Minimum Confidence: ${requirements.minConfidence}
Fallback: ${requirements.fallback || 'none'}

Stages: ${JSON.stringify(requirements.stages || [], null, 2)}
Constraints: ${JSON.stringify(requirements.constraints || {}, null, 2)}

Available primitive categories:
- execution: parallel, sequential, race, batch
- aggregation: consensus, voting, merge, reduce
- confidence: threshold, transform
- control: retry, fallback, circuit, timeout, escalate

Analyze what primitives would be needed.`;

    const result = await this.llm.generateObject({
      schema: RequirementsAnalysisSchema,
      prompt,
      system: 'You are an expert at analyzing orchestration requirements and determining what primitives are needed.'
    });

    return result.object;
  }

  /**
   * Select specific primitives based on analysis
   */
  private async selectPrimitives(
    requirements: OrchestrationRequirements,
    analysis: any
  ) {
    const availablePrimitives = Array.from(this.primitives.values())
      .map(p => `${p.name}: ${p.description}`)
      .join('\n');

    const prompt = `
Based on this analysis, select specific primitives to implement the orchestration:

Requirements: ${JSON.stringify(requirements, null, 2)}
Analysis: ${JSON.stringify(analysis, null, 2)}

Available primitives:
${availablePrimitives}

Select the minimal set of primitives needed and specify their execution order.`;

    const result = await this.llm.generateObject({
      schema: PrimitiveSelectionSchema,
      prompt,
      system: 'You are an expert at composing orchestration patterns from primitives.'
    });

    return result.object;
  }

  /**
   * Calculate pattern complexity
   */
  private calculateComplexity(primitives: any[]): number {
    const weights = {
      execution: 1,
      aggregation: 2,
      confidence: 1.5,
      control: 2
    };
    
    return primitives.reduce((total, prim) => {
      const primitive = this.primitives.get(prim.name);
      const category = primitive?.category || 'execution';
      return total + (weights[category] || 1);
    }, 0);
  }

  /**
   * Estimate agent count needed
   */
  private estimateAgentCount(requirements: OrchestrationRequirements): number {
    let count = 0;
    
    // Count from agent requirements
    if (requirements.agents) {
      count += requirements.agents.reduce((sum, a) => sum + (a.count || 1), 0);
    }
    
    // Count from stages
    if (requirements.stages) {
      requirements.stages.forEach(stage => {
        if (stage.agents) {
          count += stage.agents.reduce((sum, a) => sum + (a.count || 1), 0);
        }
      });
    }
    
    return count || 3; // Default to 3 if not specified
  }

  /**
   * Parse requirements from text
   */
  private async parseRequirements(
    requirementsText: string,
    template?: string
  ): Promise<OrchestrationRequirements> {
    const prompt = `
Parse these requirements into a structured format:

${requirementsText}

${template ? `Use template: ${template}` : ''}

Extract:
- The main goal
- Strategy (if mentioned)
- Confidence requirements
- Stages or steps
- Agent requirements
- Any constraints`;

    const result = await this.llm.generateObject({
      schema: OrchestrationRequirementsSchema as any,
      prompt,
      system: 'You are an expert at parsing orchestration requirements.'
    });

    return result.object as OrchestrationRequirements;
  }

  /**
   * Format pattern as YAML
   */
  private formatPatternAsYAML(pattern: Pattern): string {
    const yaml = `# ${pattern.name}
# ${pattern.description}
# Generated: ${pattern.metadata.generated}
# Primitives: ${pattern.metadata.primitives.join(', ')}

name: ${pattern.name}
version: ${pattern.version}
description: ${pattern.description}

metadata:
  complexity: ${pattern.metadata.complexity}
  estimatedAgents: ${pattern.metadata.estimatedAgents}
  primitives: [${pattern.metadata.primitives.join(', ')}]

steps:
${this.formatStepsAsYAML(pattern.code)}
`;
    return yaml;
  }

  /**
   * Format steps as YAML (simplified for now)
   */
  private formatStepsAsYAML(code: string): string {
    // This is a simplified version - in a real implementation,
    // we'd parse the code and format it properly
    return code.split('\n').map(line => `  ${line}`).join('\n');
  }
}