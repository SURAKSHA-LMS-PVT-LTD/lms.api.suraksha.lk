import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { InstituteApiKeyEntity, ApiKeyScope } from '../entities/institute-api-key.entity';
import { now } from '../../../common/utils/timezone.util';

interface CreateKeyDto {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string;
}

@Injectable()
export class InstituteApiKeyService {
  constructor(
    @InjectRepository(InstituteApiKeyEntity)
    private readonly repo: Repository<InstituteApiKeyEntity>,
  ) {}

  async listKeys(instituteId: string) {
    const keys = await this.repo.find({
      where: { instituteId },
      order: { createdAt: 'DESC' },
    });

    return keys.map(k => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      isActive: k.isActive,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    }));
  }

  async createKey(instituteId: string, dto: CreateKeyDto, createdBy?: string) {
    // Generate a cryptographically secure random key: "sk_" prefix + 40 random hex chars
    const rawKey = 'sk_' + crypto.randomBytes(20).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 10) + '..';

    const timestamp = now();
    const entity = this.repo.create({
      instituteId,
      name: dto.name,
      keyHash,
      keyPrefix,
      scopes: dto.scopes,
      isActive: true,
      createdBy,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const saved = await this.repo.save(entity);

    return {
      id: saved.id,
      name: saved.name,
      keyPrefix: saved.keyPrefix,
      scopes: saved.scopes,
      isActive: saved.isActive,
      expiresAt: saved.expiresAt,
      createdAt: saved.createdAt,
      // Raw key returned ONCE — not stored, not retrievable again
      key: rawKey,
      warning: 'Store this key securely — it will NOT be shown again.',
    };
  }

  async revokeKey(keyId: string, instituteId: string) {
    const key = await this.repo.findOne({ where: { id: keyId, instituteId } });
    if (!key) throw new NotFoundException('API key not found');

    key.isActive = false;
    key.updatedAt = now();
    await this.repo.save(key);

    return { message: 'API key revoked successfully', id: keyId };
  }
}
