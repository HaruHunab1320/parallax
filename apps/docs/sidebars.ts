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
        'concepts/threads',
        'concepts/patterns',
        'concepts/confidence',
        'concepts/confidence-scoring',
        'concepts/consensus',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/org-chart-flow',
        'architecture/data-plane',
        'architecture/agent-lifecycle',
        'architecture/workspace-service',
      ],
    },
    {
      type: 'category',
      label: 'SDK',
      items: [
        'sdk/overview',
        'sdk/typescript',
        'sdk/gateway-connection',
        'sdk/gateway-threads',
        'sdk/thread-handlers',
        'sdk/wrapping-agents',
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
        'patterns/org-chart-patterns',
        'patterns/advanced-composition',
      ],
    },
    {
      type: 'category',
      label: 'Agent Runtimes',
      items: [
        'agent-runtimes/overview',
        'agent-runtimes/local',
        'agent-runtimes/docker',
        'agent-runtimes/kubernetes',
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
        'api/managed-threads',
        'api/thread-stream',
        'api/agent-protocol',
        'api/webhooks',
      ],
    },
  ],
};

export default sidebars;
