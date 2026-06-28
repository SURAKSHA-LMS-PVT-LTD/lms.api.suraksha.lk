import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteClassLectureGroupEntity } from './entities/institute_class_lecture_group.entity';
import { CreateInstituteClassLectureGroupDto } from './dto/create-institute_class_lecture_group.dto';
import { UpdateInstituteClassLectureGroupDto } from './dto/update-institute_class_lecture_group.dto';

@Injectable()
export class InstituteClassLectureGroupsService {
  constructor(
    @InjectRepository(InstituteClassLectureGroupEntity)
    private readonly groupRepository: Repository<InstituteClassLectureGroupEntity>,
  ) {}

  async create(createDto: CreateInstituteClassLectureGroupDto, userId: string) {
    const group = this.groupRepository.create({
      ...createDto,
      createdBy: userId,
      updatedBy: userId,
    });
    return await this.groupRepository.save(group);
  }

  async findAll(instituteId: string, classId: string) {
    return await this.groupRepository.find({
      where: { instituteId, classId },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(id: string, instituteId: string) {
    const group = await this.groupRepository.findOne({
      where: { id, instituteId },
    });
    if (!group) {
      throw new NotFoundException(`Lesson group with ID ${id} not found in this institute.`);
    }
    return group;
  }

  async update(id: string, instituteId: string, updateDto: UpdateInstituteClassLectureGroupDto, userId: string) {
    const group = await this.findOne(id, instituteId);
    
    Object.assign(group, updateDto);
    group.updatedBy = userId;
    
    return await this.groupRepository.save(group);
  }

  async remove(id: string, instituteId: string) {
    const group = await this.findOne(id, instituteId);
    return await this.groupRepository.remove(group);
  }
}
