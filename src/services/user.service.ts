import { prisma } from '../db/client.js';
import { Role } from '../types/domain.js';

export interface UpdateProfileInput {
  displayName?: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  skills?: string[];
  languages?: string[];
  country?: string;
  timezone?: string;
  webhookUrl?: string;
}

export class UserService {
  async getByAddress(address: string) {
    return prisma.user.findUnique({
      where: { address },
      include: {
        profile: true,
        arbitratorProfile: true,
      },
    });
  }

  async getById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        arbitratorProfile: true,
      },
    });
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    return prisma.profile.upsert({
      where: { userId },
      update: {
        ...input,
      },
      create: {
        userId,
        ...input,
        skills: input.skills ?? [],
        languages: input.languages ?? ['en'],
      },
    });
  }

  async updateUserRole(userId: string, role: Role) {
    return prisma.user.update({
      where: { id: userId },
      data: { role },
      include: {
        profile: true,
        arbitratorProfile: true,
      },
    });
  }

  async listUsers(filters: {
    role?: Role;
    skill?: string;
    country?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.role) {
      where.role = filters.role;
    }
    if (filters.skill || filters.country) {
      where.profile = {
        ...(filters.skill ? { skills: { has: filters.skill } } : {}),
        ...(filters.country ? { country: filters.country } : {}),
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          profile: true,
          arbitratorProfile: true,
        },
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }
}

export const userService = new UserService();
