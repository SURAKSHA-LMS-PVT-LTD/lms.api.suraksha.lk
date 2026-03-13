import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentBookhireEnrollmentEntity, EnrollmentStatus } from '../entities/student-bookhire-enrollment.entity';
import { BookhireEntity } from '../entities/bookhire.entity';
import { 
  CreateStudentBookhireEnrollmentDto, 
  UpdateStudentBookhireEnrollmentDto, 
  EnrollmentStatusUpdateDto,
  StudentBookhireEnrollmentResponseDto,
  StudentBookhireEnrollmentListResponseDto
} from '../dto/student-bookhire-enrollment.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
@Injectable()
export class StudentBookhireEnrollmentService {
  constructor(
    @InjectRepository(StudentBookhireEnrollmentEntity)
    private enrollmentRepository: Repository<StudentBookhireEnrollmentEntity>,
    @InjectRepository(BookhireEntity)
    private bookhireRepository: Repository<BookhireEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}
  async enroll(createEnrollmentDto: CreateStudentBookhireEnrollmentDto): Promise<StudentBookhireEnrollmentEntity> {
    // Check if bookhire exists and is approved - Load necessary fields including pricePerMonth
    const bookhire = await this.bookhireRepository.findOne({
      where: { id: createEnrollmentDto.bookhireId },
      select: ['id', 'status', 'isActive', 'availableSeats', 'pricePerMonth'] // Include pricePerMonth
    });
    if (!bookhire) {
      throw new NotFoundException('Bookhire not found');
    }
    if (bookhire.status !== 'approved' || !bookhire.isActive) {
      throw new BadRequestException('Bookhire is not available for enrollment');
    }
    // Use provided student data directly since we removed access controls
    const studentName = `Student-${createEnrollmentDto.studentId}`;
    // Check if student is already enrolled in this bookhire using TypeORM - Optimized field selection
    const existingEnrollment = await this.enrollmentRepository.findOne({
      where: {
        studentId: createEnrollmentDto.studentId,
        bookhireId: createEnrollmentDto.bookhireId,
        status: EnrollmentStatus.ACTIVE
      },
      select: ['id', 'studentId', 'bookhireId', 'status'] // Only need these fields for validation
    });
    if (existingEnrollment) {
      throw new ConflictException('Student is already enrolled in this bookhire');
    }
    const timestamp = new Date();
    const enrollment = this.enrollmentRepository.create({
      studentId: createEnrollmentDto.studentId,
      bookhireId: createEnrollmentDto.bookhireId,
      enrollmentDate: new Date(),
      status: 'approved', // Auto-approve enrollments in v1
      pickupLocation: createEnrollmentDto.pickupLocation || null,
      dropoffLocation: createEnrollmentDto.dropoffLocation || null,
      monthlyFee: createEnrollmentDto.monthlyFee || bookhire.pricePerMonth || 0,
      isActive: true,
      approvedAt: new Date(), // Set approval timestamp
      approvedBy: createEnrollmentDto.studentId, // Auto-approved by system
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const savedEnrollment = await this.enrollmentRepository.save(enrollment);
    return savedEnrollment;
  }
  async findByStudent(studentId: string, page: number = 1, limit: number = 10): Promise<{
    enrollments: StudentBookhireEnrollmentEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;
    const [enrollments, total] = await Promise.all([
      this.enrollmentRepository.find({
        where: { studentId, isActive: true },
        select: [
          'id',
          'studentId',
          'bookhireId',
          'enrollmentDate',
          'status',
          'isActive',
          'pickupLocation',
          'dropoffLocation',
          'monthlyFee',
          'createdAt',
          'updatedAt'
        ],
        skip,
        take: limit,
        order: { enrollmentDate: 'DESC' }
      }),
      this.enrollmentRepository.count({ where: { studentId, isActive: true } })
    ]);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
  }
  async findByBookhire(bookhireId: number, ownerId?: string, page: number = 1, limit: number = 10): Promise<{
    enrollments: StudentBookhireEnrollmentEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;
    // If ownerId is provided, verify ownership
    if (ownerId) {
      const bookhire = await this.bookhireRepository.findOne({
        where: { id: bookhireId }
      });
      if (!bookhire || bookhire.ownerId !== ownerId) {
        throw new ForbiddenException('You can only view enrollments for your own bookhires');
      }
    }
    const [enrollments, total] = await Promise.all([
      this.enrollmentRepository.find({
        where: { 
          bookhireId,
          isActive: true 
        },
        skip,
        take: limit,
        order: { enrollmentDate: 'DESC' }
      }),
      this.enrollmentRepository.count({ 
        where: { 
          bookhireId,
          isActive: true 
        }
      })
    ]);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
  }
  async findByOwner(ownerId: string, page: number = 1, limit: number = 10): Promise<{
    enrollments: StudentBookhireEnrollmentEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;
    const [enrollments, total] = await Promise.all([
      this.enrollmentRepository.find({
        where: { isActive: true },
        skip,
        take: limit,
        order: { enrollmentDate: 'DESC' }
      }),
      this.enrollmentRepository.count({ where: { isActive: true } })
    ]);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
  }
  async updateEnrollment(
    enrollmentId: string, 
    updateDto: UpdateStudentBookhireEnrollmentDto,
    requesterId?: string,
    requesterType?: 'student' | 'owner' | 'admin'
  ): Promise<StudentBookhireEnrollmentEntity> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    // Check permissions based on requester type
    if (requesterType === 'student' && enrollment.studentId !== requesterId) {
      throw new ForbiddenException('Students can only update their own enrollments');
    }
    if (requesterType === 'owner' && false) {
      throw new ForbiddenException('Bookhire owners can only update enrollments for their bookhires');
    }
    // Students can only update certain fields
    if (requesterType === 'student') {
      const allowedFields = ['pickupLocation', 'dropoffLocation', 'monthlyFee'];
      const updateFields = Object.keys(updateDto);
      const hasDisallowedFields = updateFields.some(field => !allowedFields.includes(field));
      if (hasDisallowedFields) {
        throw new ForbiddenException('Students can only update pickup/dropoff locations and monthly fee');
      }
    }
    await this.enrollmentRepository.update(enrollmentId, updateDto);
    const updatedEnrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    return updatedEnrollment;
  }
  async cancelEnrollment(enrollmentId: string, studentId: string): Promise<void> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (enrollment.studentId !== studentId) {
      throw new ForbiddenException('Students can only cancel their own enrollments');
    }
    await this.enrollmentRepository.update(enrollmentId, {
      status: EnrollmentStatus.CANCELLED,
      isActive: false
    });
  }
  async findOne(enrollmentId: string): Promise<StudentBookhireEnrollmentEntity> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    return enrollment;
  }
  // Admin methods
  async findAll(page: number = 1, limit: number = 10): Promise<{
    enrollments: StudentBookhireEnrollmentEntity[];
    total: number;
    totalPages: number;
    currentPage: number;
  }> {
    const skip = (page - 1) * limit;
    const [enrollments, total] = await Promise.all([
      this.enrollmentRepository.find({
        skip,
        take: limit,
        order: { enrollmentDate: 'DESC' }
      }),
      this.enrollmentRepository.count()
    ]);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    };
  }
  async updateEnrollmentStatus(
    enrollmentId: string,
    statusUpdateDto: EnrollmentStatusUpdateDto,
    ownerId: string
  ): Promise<StudentBookhireEnrollmentEntity> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (false) {
      throw new ForbiddenException('You can only update status for enrollments in your bookhires');
    }
    await this.enrollmentRepository.update(enrollmentId, {
      status: statusUpdateDto.status
    });
    const updatedEnrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    return updatedEnrollment;
  }
  async getPendingVerifications(
    ownerId: string, 
    page: number = 1, 
    limit: number = 10, 
    bookhireId?: number
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      pendingVerifications: any[];
      totalPending: number;
      currentPage: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const skip = (page - 1) * limit;
    const whereClause: any = {
      ownerId: ownerId,
      status: EnrollmentStatus.PENDING,
      isActive: true
    };
    if (bookhireId) {
      whereClause.bookhireId = bookhireId;
    }
    const [enrollments, totalPending] = await Promise.all([
      this.enrollmentRepository.find({
        where: whereClause,
        skip,
        take: limit,
        order: { enrollmentDate: 'DESC' }
      }),
      this.enrollmentRepository.count({ where: whereClause })
    ]);
    const totalPages = Math.ceil(totalPending / limit);
    // For each enrollment, fetch bookhire details
    const pendingVerifications = await Promise.all(
      enrollments.map(async (enrollment) => {
        const bookhire = await this.bookhireRepository.findOne({
          where: { id: enrollment.bookhireId }
        });
        return {
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          // studentName not available
          bookhireId: enrollment.bookhireId,
          bookhireTitle: bookhire?.vehicleModel,
          vehicleNumber: bookhire?.vehicleNumber,
          enrollmentDate: enrollment.enrollmentDate,
          // parentContact not in database
          // emergencyContact not in database
          pickupLocation: enrollment.pickupLocation,
          dropoffLocation: enrollment.dropoffLocation,
          // specialInstructions not in database
          status: enrollment.status
        };
      })
    );
    return {
      success: true,
      message: 'Pending verifications retrieved successfully',
      data: {
        pendingVerifications,
        totalPending,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }
  async approveStudentVerification(enrollmentId: string, ownerId: string): Promise<{
    success: boolean;
    message: string;
    data: { enrollmentId: string; status: string; approvedAt: Date; };
  }> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (false) {
      throw new ForbiddenException('You can only approve enrollments for your own bookhires');
    }
    if (enrollment.status !== EnrollmentStatus.PENDING) {
      throw new BadRequestException('Only pending enrollments can be approved');
    }
    const currentDate = new Date();
    await this.enrollmentRepository.update(enrollmentId, {
      status: EnrollmentStatus.APPROVED
    });
    const updatedEnrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    return {
      success: true,
      message: 'Student enrollment approved successfully',
      data: {
        enrollmentId: enrollmentId,
        // studentName not available
        status: updatedEnrollment.status,
        approvedAt: currentDate
      }
    };
  }
  async rejectStudentVerification(enrollmentId: string, ownerId: string): Promise<{
    success: boolean;
    message: string;
    data: { enrollmentId: string; status: string; rejectedAt: Date; };
  }> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (false) {
      throw new ForbiddenException('You can only reject enrollments for your own bookhires');
    }
    if (enrollment.status !== EnrollmentStatus.PENDING) {
      throw new BadRequestException('Only pending enrollments can be rejected');
    }
    const currentDate = new Date();
    await this.enrollmentRepository.update(enrollmentId, {
      status: EnrollmentStatus.REJECTED,
      isActive: false
    });
    const updatedEnrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    return {
      success: true,
      message: 'Student enrollment rejected successfully',
      data: {
        enrollmentId: enrollmentId,
        // studentName not available
        status: updatedEnrollment.status,
        rejectedAt: currentDate
      }
    };
  }
  async activateStudentEnrollment(enrollmentId: string, ownerId: string): Promise<{
    success: boolean;
    message: string;
    data: { enrollmentId: string; status: string; activatedAt: Date; };
  }> {
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    if (false) {
      throw new ForbiddenException('You can only activate enrollments for your own bookhires');
    }
    if (enrollment.status !== EnrollmentStatus.APPROVED) {
      throw new BadRequestException('Only approved enrollments can be activated');
    }
    const currentDate = new Date();
    await this.enrollmentRepository.update(enrollmentId, {
      status: EnrollmentStatus.ACTIVE,
      // startDate not in database
      isActive: true
    });
    const updatedEnrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    return {
      success: true,
      message: 'Student enrollment activated successfully',
      data: {
        enrollmentId: enrollmentId,
        // studentName not available
        status: updatedEnrollment.status,
        activatedAt: currentDate,
        // startDate not in database
      }
    };
  }
  // DTO transformation methods (synchronous for performance)
  private transformEntityToDto(entity: StudentBookhireEnrollmentEntity, bookhireDetails?: any): StudentBookhireEnrollmentResponseDto {
    if (!entity) {
      return null;
    }
    let vehicleNumber = null;
    let imageUrl = null;
    let bookhireTitle = null;
    // Use provided bookhire details if available
    if (bookhireDetails) {
      vehicleNumber = bookhireDetails.vehicleNumber || null;
      // Get first image from vehicleImages array if available
      if (bookhireDetails.vehicleImages) {
        if (typeof bookhireDetails.vehicleImages === 'string') {
          // If it's a JSON string, parse it
          try {
            const parsed = JSON.parse(bookhireDetails.vehicleImages);
            if (Array.isArray(parsed) && parsed.length > 0) {
              imageUrl = parsed[0];
            }
          } catch (e) {
          }
        } else if (Array.isArray(bookhireDetails.vehicleImages) && bookhireDetails.vehicleImages.length > 0) {
          // Already an array
          imageUrl = bookhireDetails.vehicleImages[0];
        }
      }
      // Create bookhire title from vehicle info
      const type = bookhireDetails.vehicleType || 'Vehicle';
      const model = bookhireDetails.vehicleModel ? ` ${bookhireDetails.vehicleModel}` : '';
      const number = bookhireDetails.vehicleNumber || 'N/A';
      bookhireTitle = `${type}${model} - ${number}`;
    } else {
    }
    return {
      id: entity.id || null,
      studentId: entity.studentId || null,
      bookhireId: Number(entity.bookhireId) || null,
      bookhireTitle,
      vehicleNumber,
      imageUrl: this.cloudStorageService.getFullUrl(imageUrl),
      enrollmentDate: entity.enrollmentDate || null,
      status: entity.status as any || EnrollmentStatus.PENDING,
      pickupLocation: entity.pickupLocation || null,
      dropoffLocation: entity.dropoffLocation || null,
      monthlyFee: entity.monthlyFee ? Number(entity.monthlyFee) : null,
      isActive: entity.isActive !== undefined ? entity.isActive : true,
      approvedAt: entity.approvedAt || null,
      approvedBy: entity.approvedBy || null,
      rejectedAt: entity.rejectedAt || null,
      rejectionReason: entity.rejectionReason || null,
      cancelledAt: entity.cancelledAt || null,
      cancellationReason: entity.cancellationReason || null,
      createdAt: entity.createdAt || null,
      updatedAt: entity.updatedAt || null
    };
  }
  // Batch fetch bookhire details for multiple enrollments (PERFORMANCE OPTIMIZATION)
  private async fetchBookhireDetailsMap(bookhireIds: number[]): Promise<Map<number, any>> {
    if (bookhireIds.length === 0) {
      return new Map();
    }
    const bookhires = await this.bookhireRepository
      .createQueryBuilder('bookhire')
      .select(['bookhire.id', 'bookhire.vehicleNumber', 'bookhire.vehicleImages', 'bookhire.vehicleModel', 'bookhire.vehicleType'])
      .where('bookhire.id IN (:...ids)', { ids: bookhireIds })
      .getMany();
    const map = new Map();
    bookhires.forEach(bookhire => {
      map.set(bookhire.id, bookhire);
    });
    return map;
  }
  async findByStudentAsDto(studentId: string, page: number = 1, limit: number = 10): Promise<StudentBookhireEnrollmentListResponseDto> {
    const skip = (page - 1) * limit;
    const [entities, total] = await this.enrollmentRepository.findAndCount({
      where: { 
        studentId,
        isActive: true // Only active enrollments
      },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    // Batch fetch bookhire details for all enrollments (ONE query instead of N queries)
    // Convert bookhireId to number and filter out invalid values
    const bookhireIds = [...new Set(entities
      .map(e => Number(e.bookhireId))
      .filter(id => !isNaN(id) && id > 0)
    )];
    const bookhireDetailsMap = await this.fetchBookhireDetailsMap(bookhireIds);
    // Transform entities to DTOs synchronously with pre-fetched bookhire details
    const enrollments = entities
      .map(entity => this.transformEntityToDto(entity, bookhireDetailsMap.get(entity.bookhireId)))
      .filter(dto => dto !== null);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }
  async findByBookhireAsDto(bookhireId: number, ownerId?: string, page: number = 1, limit: number = 10): Promise<StudentBookhireEnrollmentListResponseDto> {
    const skip = (page - 1) * limit;
    // If ownerId is provided, verify bookhire ownership
    if (ownerId) {
      const bookhire = await this.bookhireRepository.findOne({
        where: { id: bookhireId, ownerId }
      });
      if (!bookhire) {
        throw new NotFoundException('Bookhire not found or you do not have access');
      }
    }
    const [entities, total] = await this.enrollmentRepository.findAndCount({
      where: { bookhireId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    // Batch fetch bookhire details (only one bookhire in this case)
    const bookhireDetailsMap = await this.fetchBookhireDetailsMap([bookhireId]);
    // Transform entities synchronously
    const enrollments = entities
      .map(entity => this.transformEntityToDto(entity, bookhireDetailsMap.get(entity.bookhireId)))
      .filter(dto => dto !== null);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }
  async findByOwnerAsDto(ownerId: string, page: number = 1, limit: number = 10): Promise<StudentBookhireEnrollmentListResponseDto> {
    const skip = (page - 1) * limit;
    // First find all bookhires for this owner
    const bookhires = await this.bookhireRepository.find({
      where: { ownerId },
      select: ['id']
    });
    const bookhireIds = bookhires.map(b => b.id);
    if (bookhireIds.length === 0) {
      return {
        enrollments: [],
        total: 0,
        totalPages: 0,
        currentPage: page,
        limit
      };
    }
    const [entities, total] = await this.enrollmentRepository.findAndCount({
      where: { bookhireId: bookhireIds.length === 1 ? bookhireIds[0] : undefined },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    // Batch fetch bookhire details for all enrollments
    const enrollmentBookhireIds = [...new Set(entities.map(e => e.bookhireId))];
    const bookhireDetailsMap = await this.fetchBookhireDetailsMap(enrollmentBookhireIds);
    // Transform entities synchronously
    const enrollments = entities
      .map(entity => this.transformEntityToDto(entity, bookhireDetailsMap.get(entity.bookhireId)))
      .filter(dto => dto !== null);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }
  async findAllAsDto(page: number = 1, limit: number = 10): Promise<StudentBookhireEnrollmentListResponseDto> {
    const skip = (page - 1) * limit;
    const [entities, total] = await this.enrollmentRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    // Batch fetch bookhire details for all enrollments
    const bookhireIds = [...new Set(entities.map(e => e.bookhireId))];
    const bookhireDetailsMap = await this.fetchBookhireDetailsMap(bookhireIds);
    // Transform entities synchronously
    const enrollments = entities
      .map(entity => this.transformEntityToDto(entity, bookhireDetailsMap.get(entity.bookhireId)))
      .filter(dto => dto !== null);
    return {
      enrollments,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }
  
  async findOneAsDto(enrollmentId: string): Promise<StudentBookhireEnrollmentResponseDto> {
    const entity = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId }
    });
    if (!entity) {
      throw new NotFoundException('Enrollment not found');
    }
    // Fetch bookhire details for this single enrollment
    const bookhireDetailsMap = await this.fetchBookhireDetailsMap([entity.bookhireId]);
    return this.transformEntityToDto(entity, bookhireDetailsMap.get(entity.bookhireId));
  }
  async enrollAsDto(createEnrollmentDto: CreateStudentBookhireEnrollmentDto): Promise<StudentBookhireEnrollmentResponseDto> {
    const entity = await this.enroll(createEnrollmentDto);
    // Fetch bookhire details for the newly created enrollment
    const bookhireDetailsMap = await this.fetchBookhireDetailsMap([entity.bookhireId]);
    return this.transformEntityToDto(entity, bookhireDetailsMap.get(entity.bookhireId));
  }
}
