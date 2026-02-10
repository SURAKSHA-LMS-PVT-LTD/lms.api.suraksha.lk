import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { CardService } from '../services/card.service';
import { CardOrderService } from '../services/card-order.service';
import { CardPaymentService } from '../services/card-payment.service';
import { PaymentSlipUploadService } from '../services/payment-slip-upload.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { SubmitPaymentDto } from '../dto/submit-payment.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { 
  GenerateUploadUrlDto, 
  UploadUrlResponseDto, 
  ViewUrlResponseDto,
  VerifyUploadDto,
  VerifyUploadResponseDto 
} from '../dto/payment-slip-upload.dto';
import { PaginatedCardsResponseDto } from '../dto/response/card-response.dto';
import { OrderResponseDto, PaginatedOrdersResponseDto } from '../dto/response/order-response.dto';
import { PaymentResponseDto } from '../dto/response/payment-response.dto';
import { OrderStatus } from '../enums/order-status.enum';

interface JwtRequest extends Request {
  user: { s: string; ut: string };
}

@ApiTags('User Card Orders')
@Controller('user-card')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({
  student: {},
  parent: {}
})
@ApiBearerAuth()
export class UserCardOrderController {
  constructor(
    private readonly cardService: CardService,
    private readonly orderService: CardOrderService,
    private readonly paymentService: CardPaymentService,
    private readonly paymentSlipUploadService: PaymentSlipUploadService,
  ) {}

  // Browse Cards
  @Get('cards')
  @ApiOperation({ summary: 'Get available cards catalog' })
  @ApiResponse({ status: 200, description: 'Cards retrieved successfully', type: PaginatedCardsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCards(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<PaginatedCardsResponseDto> {
    return this.cardService.findAll(page, limit, true);
  }

  // Create Order
  @Post('orders')
  @ApiOperation({ summary: 'Create new card order' })
  @ApiResponse({ status: 201, description: 'Order created successfully', type: OrderResponseDto })
  async createOrder(
    @Request() req: JwtRequest,
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const userId = req.user.s;
    return this.orderService.createOrder(userId, createOrderDto);
  }

  // ========== Payment Slip Upload (Secure) ==========

  @Post('orders/:orderId/payment-slip/upload-url')
  @ApiOperation({ 
    summary: 'Generate secure signed URL for payment slip upload',
    description: 'Returns a time-limited signed URL (15 min) for uploading payment slip. Files are stored privately and NOT indexed by search engines.',
  })
  @ApiResponse({ status: 201, description: 'Upload URL generated successfully', type: UploadUrlResponseDto })
  async generatePaymentSlipUploadUrl(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Body() generateUploadUrlDto: GenerateUploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    const userId = req.user.s;
    return this.paymentSlipUploadService.generateUploadUrl(
      userId,
      orderId,
      generateUploadUrlDto.fileName,
      generateUploadUrlDto.contentType,
    );
  }

  @Post('orders/:orderId/payment-slip/verify')
  @ApiOperation({ 
    summary: 'Verify payment slip was uploaded successfully',
    description: 'Check if file exists in cloud storage after upload',
  })
  @ApiResponse({ status: 200, description: 'Upload verification result', type: VerifyUploadResponseDto })
  async verifyPaymentSlipUpload(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Body() verifyUploadDto: VerifyUploadDto,
  ): Promise<VerifyUploadResponseDto> {
    const exists = await this.paymentSlipUploadService.verifyUpload(verifyUploadDto.relativePath);
    
    if (exists) {
      const metadata = await this.paymentSlipUploadService.getFileMetadata(verifyUploadDto.relativePath);
      return {
        success: true,
        metadata,
      };
    }
    
    return { success: false };
  }

  @Get('orders/:orderId/payment-slip/view-url')
  @ApiOperation({ 
    summary: 'Generate secure signed URL to view payment slip',
    description: 'Returns a time-limited signed URL (1 hour) for viewing/downloading payment slip',
  })
  @ApiResponse({ status: 200, description: 'View URL generated successfully', type: ViewUrlResponseDto })
  @ApiQuery({ name: 'relativePath', required: true, type: String, description: 'Relative path of payment slip' })
  async generatePaymentSlipViewUrl(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Query('relativePath') relativePath: string,
  ): Promise<ViewUrlResponseDto> {
    return this.paymentSlipUploadService.generateViewUrl(relativePath);
  }

  // Submit Payment
  @Post('orders/:orderId/payment')
  @ApiOperation({ summary: 'Submit payment for order (with uploaded slip URL)' })
  @ApiResponse({ status: 201, description: 'Payment submitted successfully', type: PaymentResponseDto })
  async submitPayment(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Body() submitPaymentDto: SubmitPaymentDto,
  ): Promise<PaymentResponseDto> {
    const userId = req.user.s;
    return this.paymentService.submitPayment(orderId, userId, submitPaymentDto);
  }

  // Get My Orders
  @Get('orders')
  @ApiOperation({ summary: "Get user's card orders" })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully', type: PaginatedOrdersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'orderStatus', required: false, enum: OrderStatus })
  async getMyOrders(
    @Request() req: JwtRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('orderStatus') orderStatus?: OrderStatus,
  ): Promise<PaginatedOrdersResponseDto> {
    const userId = req.user.s;
    return this.orderService.getMyOrders(userId, page, limit, orderStatus);
  }

  // Get Specific Order
  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Get specific order details' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully', type: OrderResponseDto })
  async getOrderById(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    const userId = req.user.s;
    return this.orderService.getOrderById(orderId, userId);
  }

  // Get My Cards (Active + Deactivated)
  @Get('my-cards')
  @ApiOperation({ summary: 'Get all my cards (all statuses: ACTIVE, INACTIVE, LOST, DAMAGED, EXPIRED, REPLACED, etc.)' })
  @ApiResponse({ status: 200, description: 'Cards retrieved successfully', type: PaginatedOrdersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyCards(
    @Request() req: JwtRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<PaginatedOrdersResponseDto> {
    const userId = req.user.s;
    return this.orderService.getMyCards(userId, page, limit);
  }

  // Activate My Card (Self-Activation)
  @Patch('my-cards/:orderId/activate')
  @ApiOperation({ summary: 'Activate my card (self-activation for INACTIVE cards)' })
  @ApiResponse({ status: 200, description: 'Card activated successfully', type: OrderResponseDto })
  async activateMyCard(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    const userId = req.user.s;
    return this.orderService.activateMyCard(userId, orderId);
  }

  // Update Card Status (Activate, Deactivate, Report Lost, etc.)
  @Patch('my-cards/:orderId/status')
  @ApiOperation({ summary: 'Update card status (report LOST, DAMAGED, or DEACTIVATED)' })
  @ApiResponse({ status: 200, description: 'Card status updated successfully', type: OrderResponseDto })
  async updateCardStatus(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Body() updateCardStatusDto: UpdateCardStatusDto,
  ): Promise<OrderResponseDto> {
    const userId = req.user.s;
    return this.orderService.updateCardStatus(orderId, userId, updateCardStatusDto);
  }
}
