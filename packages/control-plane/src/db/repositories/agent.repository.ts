import { Agent, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

export class AgentRepository extends BaseRepository {
  async create(data: Prisma.AgentCreateInput): Promise<Agent> {
    return this.executeQuery(
      () => this.prisma.agent.create({ data }),
      'AgentRepository.create'
    );
  }

  async findById(id: string): Promise<Agent | null> {
    return this.executeQuery(
      () => this.prisma.agent.findUnique({
        where: { id },
      }),
      'AgentRepository.findById'
    );
  }

  async findByName(name: string): Promise<Agent | null> {
    return this.executeQuery(
      () => this.prisma.agent.findFirst({
        where: { name },
      }),
      'AgentRepository.findByName'
    );
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    where?: Prisma.AgentWhereInput;
    orderBy?: Prisma.AgentOrderByWithRelationInput;
  }): Promise<Agent[]> {
    return this.executeQuery(
      () => this.prisma.agent.findMany(options),
      'AgentRepository.findAll'
    );
  }

  async findActive(): Promise<Agent[]> {
    return this.executeQuery(
      () => this.prisma.agent.findMany({
        where: {
          status: 'active',
          lastSeen: {
            gte: new Date(Date.now() - 60000), // Active in last minute
          },
        },
      }),
      'AgentRepository.findActive'
    );
  }

  async update(
    id: string,
    data: Prisma.AgentUpdateInput
  ): Promise<Agent> {
    return this.executeQuery(
      () => this.prisma.agent.update({
        where: { id },
        data,
      }),
      'AgentRepository.update'
    );
  }

  async updateHeartbeat(id: string): Promise<Agent> {
    return this.executeQuery(
      () => this.prisma.agent.update({
        where: { id },
        data: {
          lastSeen: new Date(),
          status: 'active',
        },
      }),
      'AgentRepository.updateHeartbeat'
    );
  }

  async delete(id: string): Promise<Agent> {
    return this.executeQuery(
      () => this.prisma.agent.delete({
        where: { id },
      }),
      'AgentRepository.delete'
    );
  }

  async markInactive(threshold: Date): Promise<number> {
    return this.executeQuery(
      async () => {
        const result = await this.prisma.agent.updateMany({
          where: {
            lastSeen: {
              lt: threshold,
            },
            status: 'active',
          },
          data: {
            status: 'inactive',
          },
        });
        return result.count;
      },
      'AgentRepository.markInactive'
    );
  }

  async getCapabilitiesStats(): Promise<any> {
    return this.executeQuery(
      async () => {
        const result = await this.prisma.$queryRaw<any[]>`
          SELECT 
            capability,
            COUNT(*) as agent_count,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count
          FROM (
            SELECT 
              id,
              status,
              jsonb_array_elements_text(capabilities) as capability
            FROM "Agent"
          ) as capabilities_expanded
          GROUP BY capability
          ORDER BY agent_count DESC`;
        
        return result;
      },
      'AgentRepository.getCapabilitiesStats'
    );
  }
}