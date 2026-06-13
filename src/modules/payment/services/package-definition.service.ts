import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackageDefinitionEntity } from '../entities/package-definition.entity';
import { CreatePackageDefinitionDto, UpdatePackageDefinitionDto, PackageDefinitionResponseDto } from '../dto/package-definition.dto';

@Injectable()
export class PackageDefinitionService {
  constructor(
    @InjectRepository(PackageDefinitionEntity)
    private readonly repo: Repository<PackageDefinitionEntity>,
  ) {}

  async create(dto: CreatePackageDefinitionDto): Promise<PackageDefinitionResponseDto> {
    const existing = await this.repo.findOne({ where: { subscriptionPlan: dto.subscriptionPlan } });
    if (existing) {
      throw new ConflictException(`Package for plan ${dto.subscriptionPlan} already exists`);
    }
    const now = new Date();
    const pkg = this.repo.create({
      ...dto,
      validityDays: dto.validityDays ?? 30,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.repo.save(pkg);
    return this.toDto(saved);
  }

  async findAll(): Promise<PackageDefinitionResponseDto[]> {
    const packages = await this.repo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
    return packages.map(p => this.toDto(p));
  }

  async findActive(): Promise<PackageDefinitionResponseDto[]> {
    const packages = await this.repo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return packages.map(p => this.toDto(p));
  }

  async findOne(id: string): Promise<PackageDefinitionResponseDto> {
    const pkg = await this.repo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Package definition not found');
    return this.toDto(pkg);
  }

  async update(id: string, dto: UpdatePackageDefinitionDto): Promise<PackageDefinitionResponseDto> {
    const pkg = await this.repo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Package definition not found');
    Object.assign(pkg, dto, { updatedAt: new Date() });
    const saved = await this.repo.save(pkg);
    return this.toDto(saved);
  }

  async remove(id: string): Promise<void> {
    const pkg = await this.repo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Package definition not found');
    await this.repo.remove(pkg);
  }

  private toDto(pkg: PackageDefinitionEntity): PackageDefinitionResponseDto {
    return {
      id: pkg.id,
      subscriptionPlan: pkg.subscriptionPlan,
      name: pkg.name,
      description: pkg.description,
      features: pkg.features,
      price: Number(pkg.price),
      validityDays: pkg.validityDays,
      imageUrl: pkg.imageUrl,
      sortOrder: pkg.sortOrder,
      isActive: pkg.isActive,
      createdAt: pkg.createdAt instanceof Date ? pkg.createdAt.toISOString() : pkg.createdAt,
      updatedAt: pkg.updatedAt instanceof Date ? pkg.updatedAt.toISOString() : pkg.updatedAt,
    };
  }
}
