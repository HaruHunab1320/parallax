import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quickstart',
        'getting-started/concepts',
        'getting-started/your-first-pattern',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'concepts/agents',
        'concepts/patterns',
        'concepts/primitives',
        'concepts/confidence-scoring',
        'concepts/consensus',
      ],
    },
    {
      type: 'category',
      label: 'SDK',
      items: [
        'sdk/overview',
        'sdk/typescript',
        'sdk/pattern-sdk',
        'sdk/agent-registration',
        'sdk/executing-patterns',
      ],
    },
    {
      type: 'category',
      label: 'Patterns',
      items: [
        'patterns/overview',
        'patterns/yaml-syntax',
        'patterns/voting-patterns',
        'patterns/quality-gates',
        'patterns/extraction-patterns',
        'patterns/verification-patterns',
        'patterns/advanced-composition',
      ],
    },
    {
      type: 'category',
      label: 'Prism DSL',
      items: [
        'prism/overview',
        'prism/syntax',
        'prism/compilation',
        'prism/using-prism-directly',
      ],
    },
    {
      type: 'category',
      label: 'Pattern Builder',
      items: [
        'pattern-builder/overview',
        'pattern-builder/nodes',
        'pattern-builder/connections',
        'pattern-builder/exporting',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/local',
        'deployment/docker',
        'deployment/kubernetes',
      ],
    },
    {
      type: 'category',
      label: 'Enterprise',
      items: [
        'enterprise/overview',
        'enterprise/high-availability',
        'enterprise/persistence',
        'enterprise/multi-region',
        'enterprise/security',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/control-plane',
        'api/agent-protocol',
        'api/webhooks',
      ],
    },
  ],
};

export default sidebars;
