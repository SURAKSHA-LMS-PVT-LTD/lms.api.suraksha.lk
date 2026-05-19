import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { InstituteApiKeyEntity, ApiKeyScope } from '../entities/institute-api-key.entity';
import { now } from '../../../common/utils/timezone.util';

export interface ApiKeyRequest extends Request {
  apiKey: InstituteApiKeyEntity;
  instituteId: string;
}

@Injectable()
export class InstituteApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(InstituteApiKeyEntity)
    private readonly apiKeyRepo: Repository<InstituteApiKeyEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();

    const authHeader: string | undefined = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const rawKey = authHeader.slice(7).trim();
    if (!rawKey) {
      throw new UnauthorizedException('API key is empty');
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepo.findOne({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < now()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Fire-and-forget: update lastUsedAt (non-blocking)
    this.apiKeyRepo.update({ id: apiKey.id }, { lastUsedAt: now() }).catch(() => {});

    req.apiKey = apiKey;
    req.instituteId = apiKey.instituteId;

    return true;
  }

  static requireScope(scope: ApiKeyScope) {
    return (apiKey: InstituteApiKeyEntity) => {
      if (!apiKey.scopes?.includes(scope)) {
        throw new ForbiddenException(`API key does not have the '${scope}' scope`);
      }
    };
  }
}
