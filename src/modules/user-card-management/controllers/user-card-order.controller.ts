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
import { SubmitPaymentDto, SubmitDrivePaymentDto } from '../dto/submit-payment.dto';
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
import { ForbiddenException } from '@nestjs/common';

interface JwtRequest extends Request {
  user: { s: string; ut: string; c?: string[] };
}

/**
 * Resolves the effective userId for an operation.
 * If forUserId is provided, validates that the requesting user is a parent of that user.
 * Returns the userId to use for the operation.
 */
function resolveUserIdForParent(req: JwtRequest, forUserId?: string): string {
  if (!forUserId || forUserId === req.user.s) {
    return req.user.s;
  }
  // Validate parent-child relationship via JWT 'c' array
  const childUserIds = (req.user.c || []).map(String);
  if (!childUserIds.includes(String(forUserId))) {
    throw new ForbiddenException('You do not have access to this user\'s data');
  }
  return forUserId;
}

@ApiTags('User Card Orders')
@Controller('user-card')
@UseGuards(JwtAuthGuard)
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

  // Create Order (supports parent ordering for child via forUserId query)
  @Post('orders')
  @ApiOperation({ summary: 'Create new card order (parent can order for child via ?forUserId=)' })
  @ApiResponse({ status: 201, description: 'Order created successfully', type: OrderResponseDto })
  @ApiQuery({ name: 'forUserId', required: false, type: String, description: 'Child user ID (parent ordering for child)' })
  async createOrder(
    @Request() req: JwtRequest,
    @Body() createOrderDto: CreateOrderDto,
    @Query('forUserId') forUserId?: string,
  ): Promise<OrderResponseDto> {
    const userId = resolveUserIdForParent(req, forUserId);
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

  // Submit Payment (Cloud Storage)
  @Post('orders/:orderId/payment')
  @ApiOperation({ summary: 'Submit payment for order (with uploaded slip URL from cloud storage)' })
  @ApiResponse({ status: 201, description: 'Payment submitted successfully', type: PaymentResponseDto })
  async submitPayment(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Body() submitPaymentDto: SubmitPaymentDto,
  ): Promise<PaymentResponseDto> {
    const userId = req.user.s;
    return this.paymentService.submitPayment(orderId, userId, submitPaymentDto);
  }

  // Submit Payment via Google Drive
  @Post('orders/:orderId/payment/drive')
  @ApiOperation({
    summary: 'Submit payment proof uploaded to Google Drive',
    description: `Upload payment receipt directly to your Google Drive and register it here.

**Flow:**
1. \`GET /drive-access/token\` – get a short-lived Google OAuth access token
2. \`GET /drive-access/folder?purpose=ID_CARD_PAYMENT\` – create/get an organised Drive folder
3. Upload file directly to Google Drive using the access token (returns a Drive \`fileId\` & \`webViewLink\`)
4. Call this endpoint with the Drive file details`,
  })
  @ApiResponse({ status: 201, description: 'Drive payment registered successfully', type: PaymentResponseDto })
  async submitDrivePayment(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
    @Body() submitDrivePaymentDto: SubmitDrivePaymentDto,
  ): Promise<PaymentResponseDto> {
    const userId = req.user.s;
    return this.paymentService.submitDrivePayment(orderId, userId, submitDrivePaymentDto);
  }

  // Get My Orders (supports parent viewing child's orders via forUserId query)
  @Get('orders')
  @ApiOperation({ summary: "Get user's card orders (parent can view child's via ?forUserId=)" })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully', type: PaginatedOrdersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'orderStatus', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'forUserId', required: false, type: String, description: 'Child user ID (parent viewing child orders)' })
  async getMyOrders(
    @Request() req: JwtRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('orderStatus') orderStatus?: OrderStatus,
    @Query('forUserId') forUserId?: string,
  ): Promise<PaginatedOrdersResponseDto> {
    const userId = resolveUserIdForParent(req, forUserId);
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

  // Get My Cards (Active + Deactivated) — supports parent viewing child's cards
  @Get('my-cards')
  @ApiOperation({ summary: "Get all cards (parent can view child's via ?forUserId=)" })
  @ApiResponse({ status: 200, description: 'Cards retrieved successfully', type: PaginatedOrdersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'forUserId', required: false, type: String, description: 'Child user ID (parent viewing child cards)' })
  async getMyCards(
    @Request() req: JwtRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('forUserId') forUserId?: string,
  ): Promise<PaginatedOrdersResponseDto> {
    const userId = resolveUserIdForParent(req, forUserId);
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

  // Cancel Order (only while in PENDING_PAYMENT status)
  @Patch('orders/:orderId/cancel')
  @ApiOperation({
    summary: 'Cancel a card order',
    description:
      'Cancels an order that is still in PENDING_PAYMENT status (no payment has been submitted yet). ' +
      'Stock is restored automatically.',
  })
  @ApiResponse({ status: 200, description: 'Order cancelled successfully', type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Order cannot be cancelled in its current status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async cancelOrder(
    @Request() req: JwtRequest,
    @Param('orderId') orderId: string,
  ): Promise<OrderResponseDto> {
    const userId = req.user.s;
    return this.orderService.cancelOrder(orderId, userId);
  }
}
