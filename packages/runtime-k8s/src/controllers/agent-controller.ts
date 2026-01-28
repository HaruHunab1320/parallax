/**
 * ParallaxAgent Controller
 *
 * Reconciles ParallaxAgent CRD resources by creating/updating Deployments and Services.
 */

import * as k8s from '@kubernetes/client-node';
import { Logger } from 'pino';

const CRD_GROUP = 'parallax.ai';
const CRD_VERSION = 'v1';
const CRD_PLURAL = 'parallaxagents';

export interface ControllerOptions {
  namespace: string;
  imagePrefix?: string;
  defaultCpu?: string;
  defaultMemory?: string;
}

const DEFAULT_IMAGES: Record<string, string> = {
  claude: 'parallax/agent-claude:latest',
  codex: 'parallax/agent-codex:latest',
  gemini: 'parallax/agent-gemini:latest',
  aider: 'parallax/agent-aider:latest',
  custom: 'parallax/agent-base:latest',
};

export class AgentController {
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private customApi: k8s.CustomObjectsApi;
  private watcher: k8s.Watch;
  private running = false;

  constructor(
    private kc: k8s.KubeConfig,
    private logger: Logger,
    private options: ControllerOptions
  ) {
    this.coreApi = kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
    this.customApi = kc.makeApiClient(k8s.CustomObjectsApi);
    this.watcher = new k8s.Watch(kc);
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.logger.info('Starting AgentController');
    this.running = true;

    const path = `/apis/${CRD_GROUP}/${CRD_VERSION}/namespaces/${this.options.namespace}/${CRD_PLURAL}`;

    await this.watcher.watch(
      path,
      {},
      async (type, apiObj) => {
        try {
          await this.handleEvent(type, apiObj);
        } catch (error) {
          this.logger.error({ error, type, name: apiObj.metadata?.name }, 'Reconciliation error');
        }
      },
      (err) => {
        if (err) {
          this.logger.error({ error: err }, 'Watch error, restarting...');
          if (this.running) {
            setTimeout(() => this.start(), 5000);
          }
        }
      }
    );
  }

  stop(): void {
    this.running = false;
  }

  private async handleEvent(type: string, obj: any): Promise<void> {
    const name = obj.metadata?.name;
    const agentId = obj.metadata?.labels?.['parallax.ai/agent-id'];

    this.logger.info({ type, name, agentId }, 'Processing event');

    switch (type) {
      case 'ADDED':
        await this.reconcileAgent(obj);
        break;
      case 'MODIFIED':
        await this.reconcileAgent(obj);
        break;
      case 'DELETED':
        await this.cleanupAgent(obj);
        break;
    }
  }

  private async reconcileAgent(agent: any): Promise<void> {
    const name = agent.metadata.name;
    const namespace = agent.metadata.namespace || this.options.namespace;
    const spec = agent.spec;

    this.logger.info({ name, type: spec.type }, 'Reconciling agent');

    // Update status to Starting
    await this.updateStatus(name, namespace, {
      phase: 'Starting',
      message: 'Creating deployment and service',
    });

    // Create or update Deployment
    await this.reconcileDeployment(agent, namespace);

    // Create or update Service
    await this.reconcileService(agent, namespace);

    // Update status to Ready
    const serviceName = `${name}-svc`;
    await this.updateStatus(name, namespace, {
      phase: 'Ready',
      endpoint: `http://${serviceName}.${namespace}.svc.cluster.local:8080`,
      readyReplicas: 1,
      message: 'Agent is ready',
    });
  }

  private async reconcileDeployment(agent: any, namespace: string): Promise<void> {
    const name = agent.metadata.name;
    const spec = agent.spec;
    const agentId = agent.metadata.labels['parallax.ai/agent-id'];

    const image = spec.image || this.getImageForType(spec.type);
    const cpu = spec.resources?.cpu || this.options.defaultCpu || '1';
    const memory = spec.resources?.memory || this.options.defaultMemory || '2Gi';

    const deployment: k8s.V1Deployment = {
      metadata: {
        name,
        namespace,
        labels: {
          'parallax.ai/managed': 'true',
          'parallax.ai/agent-id': agentId,
          'parallax.ai/agent-type': spec.type,
        },
        ownerReferences: [
          {
            apiVersion: `${CRD_GROUP}/${CRD_VERSION}`,
            kind: 'ParallaxAgent',
            name: agent.metadata.name,
            uid: agent.metadata.uid,
            controller: true,
            blockOwnerDeletion: true,
          },
        ],
      },
      spec: {
        replicas: spec.scaling?.min || 1,
        selector: {
          matchLabels: {
            'parallax.ai/agent-id': agentId,
          },
        },
        template: {
          metadata: {
            labels: {
              'parallax.ai/managed': 'true',
              'parallax.ai/agent-id': agentId,
              'parallax.ai/agent-type': spec.type,
            },
          },
          spec: {
            containers: [
              {
                name: 'agent',
                image,
                ports: [{ containerPort: 8080 }],
                env: this.buildEnv(spec, agentId),
                resources: {
                  requests: { cpu, memory },
                  limits: { cpu, memory },
                },
                readinessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 8080 as any,
                  },
                  initialDelaySeconds: 10,
                  periodSeconds: 5,
                },
                livenessProbe: {
                  httpGet: {
                    path: '/health',
                    port: 8080 as any,
                  },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
                },
              },
            ],
            restartPolicy: spec.autoRestart === false ? 'Never' : 'Always',
          },
        },
      },
    };

    try {
      await this.appsApi.readNamespacedDeployment({ name, namespace });
      // Update existing
      await this.appsApi.replaceNamespacedDeployment({ name, namespace, body: deployment });
      this.logger.debug({ name }, 'Updated deployment');
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Create new
        await this.appsApi.createNamespacedDeployment({ namespace, body: deployment });
        this.logger.debug({ name }, 'Created deployment');
      } else {
        throw error;
      }
    }
  }

  private async reconcileService(agent: any, namespace: string): Promise<void> {
    const name = `${agent.metadata.name}-svc`;
    const agentId = agent.metadata.labels['parallax.ai/agent-id'];

    const service: k8s.V1Service = {
      metadata: {
        name,
        namespace,
        labels: {
          'parallax.ai/managed': 'true',
          'parallax.ai/agent-id': agentId,
        },
        ownerReferences: [
          {
            apiVersion: `${CRD_GROUP}/${CRD_VERSION}`,
            kind: 'ParallaxAgent',
            name: agent.metadata.name,
            uid: agent.metadata.uid,
            controller: true,
            blockOwnerDeletion: true,
          },
        ],
      },
      spec: {
        selector: {
          'parallax.ai/agent-id': agentId,
        },
        ports: [
          {
            port: 8080,
            targetPort: 8080 as any,
            protocol: 'TCP',
          },
        ],
        type: 'ClusterIP',
      },
    };

    try {
      await this.coreApi.readNamespacedService({ name, namespace });
      // Update existing
      await this.coreApi.replaceNamespacedService({ name, namespace, body: service });
      this.logger.debug({ name }, 'Updated service');
    } catch (error: any) {
      if (error.statusCode === 404) {
        // Create new
        await this.coreApi.createNamespacedService({ namespace, body: service });
        this.logger.debug({ name }, 'Created service');
      } else {
        throw error;
      }
    }
  }

  private async cleanupAgent(agent: any): Promise<void> {
    const name = agent.metadata.name;
    const namespace = agent.metadata.namespace || this.options.namespace;

    this.logger.info({ name }, 'Cleaning up agent resources');

    // Deployment and Service should be cleaned up automatically via ownerReferences
    // But we can force cleanup if needed
    try {
      await this.appsApi.deleteNamespacedDeployment({ name, namespace });
    } catch {
      // Ignore
    }

    try {
      await this.coreApi.deleteNamespacedService({ name: `${name}-svc`, namespace });
    } catch {
      // Ignore
    }
  }

  private async updateStatus(
    name: string,
    namespace: string,
    status: Record<string, any>
  ): Promise<void> {
    try {
      const current = await this.customApi.getNamespacedCustomObject({
        group: CRD_GROUP,
        version: CRD_VERSION,
        namespace,
        plural: CRD_PLURAL,
        name,
      });

      const patch = {
        status: {
          ...(current as any).status,
          ...status,
          lastTransitionTime: new Date().toISOString(),
        },
      };

      await this.customApi.patchNamespacedCustomObjectStatus({
        group: CRD_GROUP,
        version: CRD_VERSION,
        namespace,
        plural: CRD_PLURAL,
        name,
        body: patch,
      });
    } catch (error) {
      this.logger.warn({ error, name }, 'Failed to update status');
    }
  }

  private getImageForType(type: string): string {
    const baseImage = DEFAULT_IMAGES[type] || DEFAULT_IMAGES.custom;
    return this.options.imagePrefix ? `${this.options.imagePrefix}/${baseImage}` : baseImage;
  }

  private buildEnv(spec: any, agentId: string): k8s.V1EnvVar[] {
    const env: k8s.V1EnvVar[] = [
      { name: 'AGENT_ID', value: agentId },
      { name: 'AGENT_NAME', value: spec.name },
      { name: 'AGENT_TYPE', value: spec.type },
      { name: 'AGENT_ROLE', value: spec.role || '' },
      { name: 'AGENT_CAPABILITIES', value: JSON.stringify(spec.capabilities || []) },
    ];

    // Add credentials from secret if specified
    if (spec.credentials?.secretRef) {
      const secretName = spec.credentials.secretRef;

      if (spec.credentials.anthropicKeyRef) {
        env.push({
          name: 'ANTHROPIC_API_KEY',
          valueFrom: {
            secretKeyRef: {
              name: secretName,
              key: spec.credentials.anthropicKeyRef,
            },
          },
        });
      }

      if (spec.credentials.openaiKeyRef) {
        env.push({
          name: 'OPENAI_API_KEY',
          valueFrom: {
            secretKeyRef: {
              name: secretName,
              key: spec.credentials.openaiKeyRef,
            },
          },
        });
      }

      if (spec.credentials.googleKeyRef) {
        env.push({
          name: 'GOOGLE_API_KEY',
          valueFrom: {
            secretKeyRef: {
              name: secretName,
              key: spec.credentials.googleKeyRef,
            },
          },
        });
      }
    }

    // Add custom env vars
    if (spec.env) {
      for (const e of spec.env) {
        env.push(e);
      }
    }

    return env;
  }
}
