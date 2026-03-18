import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookhireEntity } from '../entities/bookhire.entity';
import { BookhireOwnerEntity } from '../entities/bookhire-owner.entity';
import { StudentBookhireEnrollmentEntity } from '../entities/student-bookhire-enrollment.entity';
import { CreateBookhireDto, UpdateBookhireDto, BookhireResponseDto, BookhireListResponseDto } from '../dto/bookhire.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class BookhireService {
  constructor(
    @InjectRepository(BookhireEntity)
    private bookhireRepository: Repository<BookhireEntity>,
    @InjectRepository(BookhireOwnerEntity)
    private bookhireOwnerRepository: Repository<BookhireOwnerEntity>,
    @InjectRepository(StudentBookhireEnrollmentEntity)
    private enrollmentRepository: Repository<StudentBookhireEnrollmentEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(ownerId: string, createBookhireDto: CreateBookhireDto): Promise<BookhireEntity> {
    // Allow multiple bookhires for same vehicle number (different routes, schedules, etc.)
    // No uniqueness constraint on vehicle number
    
    // Map DTO fields to entity fields properly
    const timestamp = now();
    const bookhire = this.bookhireRepository.create({
      ownerId,
      vehicleNumber: createBookhireDto.vehicleNumber.toUpperCase(),
      vehicleType: 'bus', // Default vehicleType since not in DTO
      vehicleModel: `${createBookhireDto.year} - ${createBookhireDto.title}`, // Combine year and title
      capacity: createBookhireDto.capacity || 20,
      route: createBookhireDto.route || null,
      pricePerMonth: 1000, // Default price since not in DTO - should be updated by owner later
      availableSeats: createBookhireDto.capacity || 20,
      vehicleImages: createBookhireDto.imageUrl ? [createBookhireDto.imageUrl] : [],
      createdAt: timestamp,
      updatedAt: timestamp
      // Note: description field exists in DTO but not in entity
    });

    const savedBookhire = await this.bookhireRepository.save(bookhire);
    
    // Load the owner relation before returning
    return this.bookhireRepository.findOne({
      where: { id: savedBookhire.id },
      relations: ['owner']
    });
  }

  async findByOwner(ownerId: string, page: number = 1, limit: number = 10): Promise<{
    bookhires: BookhireEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;

    const qb = this.bookhireRepository.createQueryBuilder('bookhire')
      .leftJoinAndSelect('bookhire.owner', 'owner')
      .where('bookhire.ownerId = :ownerId', { ownerId })
      .orderBy('bookhire.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [bookhires, total] = await qb.getManyAndCount();

    return {
      bookhires,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
  }

  async findOne(id: number, ownerId?: string): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id },
      relations: ['owner']
    });
    
    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    // If ownerId is provided, check ownership
    if (ownerId && bookhire.ownerId !== ownerId) {
      throw new ForbiddenException('You can only access your own bookhires');
    }

    return bookhire;
  }

  async findByVehicleNumber(vehicleNumber: string): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { vehicleNumber: vehicleNumber.toUpperCase() },
      relations: ['owner']
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    return bookhire;
  }

  async update(id: number, ownerId: string, updateBookhireDto: UpdateBookhireDto): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id }
    });
    
    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    if (bookhire.ownerId !== ownerId) {
      throw new ForbiddenException('You can only update your own bookhires');
    }

    // If updating vehicle number, check for conflicts
    if (updateBookhireDto.vehicleNumber) {
      const existingBookhire = await this.bookhireRepository.findOne({
        where: { 
          vehicleNumber: updateBookhireDto.vehicleNumber.toUpperCase(),
        }
      });

      if (existingBookhire && existingBookhire.id !== id) {
        throw new ConflictException('Vehicle number already registered');
      }

      updateBookhireDto.vehicleNumber = updateBookhireDto.vehicleNumber.toUpperCase();
    }

    // Map DTO fields to entity fields for update
    const updateData: any = {};
    if (updateBookhireDto.vehicleNumber !== undefined) updateData.vehicleNumber = updateBookhireDto.vehicleNumber;
    if (updateBookhireDto.capacity !== undefined) updateData.capacity = updateBookhireDto.capacity;
    if (updateBookhireDto.route !== undefined) updateData.route = updateBookhireDto.route;
    if (updateBookhireDto.isActive !== undefined) updateData.isActive = updateBookhireDto.isActive;
    if (updateBookhireDto.imageUrl !== undefined) updateData.vehicleImages = [updateBookhireDto.imageUrl];
    // Map title and year to vehicleModel if provided
    if (updateBookhireDto.title !== undefined && updateBookhireDto.year !== undefined) {
      updateData.vehicleModel = `${updateBookhireDto.year} - ${updateBookhireDto.title}`;
    } else if (updateBookhireDto.title !== undefined) {
      updateData.vehicleModel = updateBookhireDto.title;
    }

    await this.bookhireRepository.update(id, updateData);

    return this.findOne(id, ownerId);
  }

  async remove(id: number, ownerId: string): Promise<void> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id }
    });
    
    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    if (bookhire.ownerId !== ownerId) {
      throw new ForbiddenException('You can only delete your own bookhires');
    }

    await this.bookhireRepository.remove(bookhire);
  }

  // Admin methods
  async findAll(page: number = 1, limit: number = 10): Promise<{
    bookhires: BookhireEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;

    const qb = this.bookhireRepository.createQueryBuilder('bookhire')
      .leftJoinAndSelect('bookhire.owner', 'owner')
      .orderBy('bookhire.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [bookhires, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      bookhires,
      total,
      totalPages,
      currentPage: page,
    };
  }

  async approveBookhire(id: number): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id },
      relations: ['owner']
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    await this.bookhireRepository.update(id, { status: 'approved' });

    return this.findOne(id);
  }

  async rejectBookhire(id: number): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id },
      relations: ['owner']
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    await this.bookhireRepository.update(id, { status: 'rejected' });

    return this.findOne(id);
  }

  async deactivateBookhire(id: number): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id },
      relations: ['owner']
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    await this.bookhireRepository.update(id, { isActive: false });

    return this.findOne(id);
  }

  async activateBookhire(id: number): Promise<BookhireEntity> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id },
      relations: ['owner']
    });

    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    await this.bookhireRepository.update(id, { isActive: true });

    return this.findOne(id);
  }

  async getAvailableBookhires(page: number = 1, limit: number = 10): Promise<{
    bookhires: BookhireEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;
    
    const qb = this.bookhireRepository.createQueryBuilder('bookhire')
      .leftJoinAndSelect('bookhire.owner', 'owner')
      .where('bookhire.isActive = :isActive', { isActive: true })
      .andWhere('bookhire.status = :status', { status: 'approved' })
      .orderBy('bookhire.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [bookhires, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      bookhires,
      total,
      totalPages,
      currentPage: page,
    };
  }

  async getBookhireStats(): Promise<{
    totalBookhires: number;
    approvedBookhires: number;
    pendingBookhires: number;
    activeBookhires: number;
  }> {
    const [
      totalBookhires,
      approvedBookhires,
      pendingBookhires,
      activeBookhires
    ] = await Promise.all([
      this.bookhireRepository.count(),
      this.bookhireRepository.count({ where: { status: 'approved' } }),
      this.bookhireRepository.count({ where: { status: 'rejected' } }),
      this.bookhireRepository.count({ where: { isActive: true } })
    ]);

    return {
      totalBookhires,
      approvedBookhires,
      pendingBookhires,
      activeBookhires,
    };
  }

  async findApprovedBookhires(page: number = 1, limit: number = 10): Promise<{
    bookhires: BookhireEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;

    const qb = this.bookhireRepository.createQueryBuilder('bookhire')
      .leftJoinAndSelect('bookhire.owner', 'owner')
      .where('bookhire.status = :status', { status: 'approved' })
      .andWhere('bookhire.isActive = :isActive', { isActive: true })
      .orderBy('bookhire.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [bookhires, total] = await qb.getManyAndCount();

    return {
      bookhires,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
  }

  async getBookhireStudents(
    bookhireId: number, 
    ownerId: string, 
    page: number = 1, 
    limit: number = 10, 
    status?: string
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      students: any[];
      totalStudents: number;
      currentPage: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    // First verify the bookhire exists and belongs to the owner
    const bookhire = await this.bookhireRepository.findOne({
      where: { id: bookhireId }
    });
    
    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }

    if (bookhire.ownerId !== ownerId) {
      throw new ForbiddenException('You can only access students from your own bookhires');
    }

    // Build where clause for enrollments
    const whereClause: any = {
      bookhireId: bookhireId,
      isActive: true
    };

    // Add status filter if provided
    if (status) {
      whereClause.status = status.toLowerCase();
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Fetch enrollments from database
    const [enrollments, totalStudents] = await this.enrollmentRepository.findAndCount({
      where: whereClause,
      skip,
      take: limit,
      order: { enrollmentDate: 'DESC' }
    });

    // Transform enrollments to student data
    const students = enrollments.map(enrollment => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentName: `Student ${enrollment.studentId}`, // Name not stored in enrollment
      enrollmentStatus: enrollment.status,
      pickupTime: null, // Not stored in current schema
      dropoffTime: null, // Not stored in current schema
      pickupLocation: enrollment.pickupLocation || null,
      dropoffLocation: enrollment.dropoffLocation || null,
      monthlyFee: enrollment.monthlyFee ? Number(enrollment.monthlyFee) : null,
      enrollmentDate: enrollment.enrollmentDate,
      parentContact: null, // Not stored in current schema
      emergencyContact: null, // Not stored in current schema
      rfid: enrollment.studentId, // Using studentId as RFID placeholder
      isActive: enrollment.isActive
    }));

    const totalPages = Math.ceil(totalStudents / limit);

    return {
      success: true,
      message: `Found ${totalStudents} enrolled students`,
      data: {
        students,
        totalStudents,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }

  // ========================================
  // ENTITY TO DTO TRANSFORMATION METHODS
  // ========================================

  private transformEntityToDto(entity: BookhireEntity): BookhireResponseDto {
    if (!entity) {
      return null;
    }

    // Handle vehicleImages array safely and convert to full URLs
    const vehicleImages = Array.isArray(entity.vehicleImages) 
      ? this.cloudStorageService.getFullUrls(entity.vehicleImages)
      : [];
    const imageUrl = vehicleImages.length > 0 ? vehicleImages[0] : null;

    // Handle owner data safely 
    let ownerName = null;
    let ownerPhone = null; 
    let ownerEmail = null;
    
    if (entity.owner) {
      ownerName = entity.owner.name || null;
      ownerPhone = entity.owner.phone || null;
      ownerEmail = entity.owner.email || null;
    } else {
      // Log when owner relation is not loaded
    }

    // Handle amenities array safely
    const amenities = Array.isArray(entity.amenities) ? entity.amenities.filter(amenity => amenity && typeof amenity === 'string') : [];

    // Calculate available seats safely
    const capacity = entity.capacity || 0;
    const availableSeats = entity.availableSeats !== undefined ? entity.availableSeats : capacity;

    // Handle pricing safely
    const monthlyFee = entity.pricePerMonth ? Number(entity.pricePerMonth) : 0;

    return {
      id: entity.id || null,
      vehicleNumber: entity.vehicleNumber || null,
      vehicleModel: entity.vehicleModel || null,
      monthlyFee: monthlyFee,
      imageUrl: imageUrl,
      isAvailable: entity.isActive !== undefined ? entity.isActive : true,
      ownerName: ownerName,
      ownerPhone: ownerPhone,
      ownerEmail: ownerEmail,
      route: entity.route || null,
      capacity: capacity,
      availableSeats: availableSeats,
      isActive: entity.isActive !== undefined ? entity.isActive : true,
      status: entity.status || 'pending',
      createdAt: entity.createdAt || null,
      updatedAt: entity.updatedAt || null,
      ownerId: entity.ownerId || entity.owner?.id || null,
      vehicleImages: vehicleImages,
      amenities: amenities,
      approvedBy: entity.approvedBy || null,
      approvedAt: entity.approvedAt || null,
      rejectedAt: entity.rejectedAt || null,
      rejectionReason: entity.rejectionReason || null
    };
  }

  async findByOwnerAsDto(ownerId: string, page: number = 1, limit: number = 10): Promise<BookhireListResponseDto> {
    const result = await this.findByOwner(ownerId, page, limit);
    return {
      bookhires: result.bookhires.map(entity => this.transformEntityToDto(entity)).filter(dto => dto !== null),
      total: result.total,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      limit
    };
  }

  async findOneAsDto(id: number, ownerId?: string): Promise<BookhireResponseDto> {
    const entity = await this.findOne(id, ownerId);
    return this.transformEntityToDto(entity);
  }

  async createAsDto(ownerId: string, createBookhireDto: CreateBookhireDto): Promise<BookhireResponseDto> {
    const entity = await this.create(ownerId, createBookhireDto);
    return this.transformEntityToDto(entity);
  }

  async updateAsDto(id: number, ownerId: string, updateBookhireDto: UpdateBookhireDto): Promise<BookhireResponseDto> {
    const entity = await this.update(id, ownerId, updateBookhireDto);
    return this.transformEntityToDto(entity);
  }

  async findAllAsDto(page: number = 1, limit: number = 10): Promise<BookhireListResponseDto> {
    const result = await this.findAll(page, limit);
    return {
      bookhires: result.bookhires.map(entity => this.transformEntityToDto(entity)).filter(dto => dto !== null),
      total: result.total,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      limit
    };
  }

  async findApprovedBookhiresAsDto(page: number = 1, limit: number = 10): Promise<BookhireListResponseDto> {
    const skip = (page - 1) * limit;

    const qb = this.bookhireRepository.createQueryBuilder('bookhire')
      .leftJoinAndSelect('bookhire.owner', 'owner')
      .where('bookhire.status = :status', { status: 'approved' })
      .andWhere('bookhire.isActive = :isActive', { isActive: true })
      .orderBy('bookhire.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [bookhires, total] = await qb.getManyAndCount();

    return {
      bookhires: bookhires.map(entity => this.transformEntityToDto(entity)).filter(dto => dto !== null),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }

  async findByVehicleNumberAsDto(vehicleNumber: string): Promise<BookhireResponseDto> {
    const entity = await this.findByVehicleNumber(vehicleNumber);
    return this.transformEntityToDto(entity);
  }

  // Debug method to check owner data integrity
  async debugOwnerData(bookhireId: number): Promise<any> {
    const bookhire = await this.bookhireRepository.findOne({
      where: { id: bookhireId },
      relations: ['owner']
    });

    if (!bookhire) {
      return { error: 'BookHire not found' };
    }

    const ownerExists = await this.bookhireOwnerRepository.findOne({
      where: { id: bookhire.ownerId }
    });

    return {
      bookhireId: bookhire.id,
      ownerId: bookhire.ownerId,
      ownerRelationLoaded: !!bookhire.owner,
      ownerExistsInDb: !!ownerExists,
      ownerData: bookhire.owner ? {
        id: bookhire.owner.id,
        name: bookhire.owner.name,
        phone: bookhire.owner.phone,
        email: bookhire.owner.email
      } : null,
      directOwnerQuery: ownerExists ? {
        id: ownerExists.id,
        name: ownerExists.name,
        phone: ownerExists.phone,
        email: ownerExists.email
      } : null
    };
  }
}
