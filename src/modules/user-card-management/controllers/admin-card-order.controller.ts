import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { CardService } from '../services/card.service';
import { CardOrderService } from '../services/card-order.service';
import { CardPaymentService } from '../services/card-payment.service';
import { CreateCardDto } from '../dto/create-card.dto';
import { UpdateCardDto } from '../dto/update-card.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { AssignRfidDto } from '../dto/assign-rfid.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { VerifyCardPaymentDto } from '../dto/verify-payment.dto';
import { CardResponseDto, PaginatedCardsResponseDto } from '../dto/response/card-response.dto';
import { OrderResponseDto, PaginatedOrdersResponseDto } from '../dto/response/order-response.dto';
import { PaginatedPaymentsResponseDto, PaymentResponseDto } from '../dto/response/payment-response.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { CardType } from '../enums/card-type.enum';

interface JwtRequest extends Request {
  user: { s: string; ut: string };
}

@ApiTags('Admin - Card Management')
@Controller('admin')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@ApiBearerAuth()
export class AdminCardOrderController {
  constructor(
    private readonly cardService: CardService,
    private readonly orderService: CardOrderService,
    private readonly paymentService: CardPaymentService,
  ) {}

  // ========== Card Catalog Management ==========

  @Get('cards')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get all cards in catalog' })
  @ApiResponse({ status: 200, description: 'Cards retrieved successfully', type: PaginatedCardsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  async getAllCards(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('isActive') isActive?: boolean,
  ): Promise<PaginatedCardsResponseDto> {
    return this.cardService.findAll(page, limit, isActive);
  }

  @Post('cards')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Create new card in catalog' })
  @ApiResponse({ status: 201, description: 'Card created successfully', type: CardResponseDto })
  async createCard(@Body() createCardDto: CreateCardDto): Promise<CardResponseDto> {
    return this.cardService.create(createCardDto);
  }

  @Get('cards/:cardId')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get card details' })
  @ApiResponse({ status: 200, description: 'Card retrieved successfully', type: CardResponseDto })
  async getCardById(@Param('cardId') cardId: string): Promise<CardResponseDto> {
    return this.cardService.findOne(cardId);
  }

  @Patch('cards/:cardId')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Update card details' })
  @ApiResponse({ status: 200, description: 'Card updated successfully', type: CardResponseDto })
  async updateCard(
    @Param('cardId') cardId: string,
    @Body() updateCardDto: UpdateCardDto,
  ): Promise<CardResponseDto> {
    return this.cardService.update(cardId, updateCardDto);
  }

  @Delete('cards/:cardId')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Deactivate card (soft delete)' })
  @ApiResponse({ status: 200, description: 'Card deactivated successfully' })
  async deactivateCard(@Param('cardId') cardId: string): Promise<{ message: string }> {
    return this.cardService.remove(cardId);
  }

  // ========== User Card Lookup ==========

  @Get('users/:userId/card')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get all card orders for a specific user' })
  @ApiResponse({ status: 200, description: 'User card orders retrieved successfully', type: PaginatedOrdersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserCardOrders(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<PaginatedOrdersResponseDto> {
    return this.orderService.getAllOrders(page, limit, { userId });
  }

  // ========== Statistics ==========

  @Get('card-orders/statistics')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get card order statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiQuery({ name: 'dateFrom', required: false, type: Date })
  @ApiQuery({ name: 'dateTo', required: false, type: Date })
  async getStatistics(
    @Query('dateFrom') dateFrom?: Date,
    @Query('dateTo') dateTo?: Date,
  ): Promise<any> {
    return this.orderService.getStatistics(dateFrom, dateTo);
  }

  // ========== Order Management ==========

  @Get('card-orders')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get all card orders' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully', type: PaginatedOrdersResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'orderStatus', required: false, enum: OrderStatus })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'cardType', required: false, enum: CardType })
  @ApiQuery({ name: 'dateFrom', required: false, type: Date })
  @ApiQuery({ name: 'dateTo', required: false, type: Date })
  async getAllOrders(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('orderStatus') orderStatus?: OrderStatus,
    @Query('userId') userId?: string,
    @Query('cardType') cardType?: CardType,
    @Query('dateFrom') dateFrom?: Date,
    @Query('dateTo') dateTo?: Date,
  ): Promise<PaginatedOrdersResponseDto> {
    return this.orderService.getAllOrders(page, limit, {
      orderStatus,
      userId,
      cardType,
      dateFrom,
      dateTo,
    });
  }

  @Get('card-orders/:orderId')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get order details' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully', type: OrderResponseDto })
  async getOrderById(@Param('orderId') orderId: string): Promise<OrderResponseDto> {
    return this.orderService.getOrderById(orderId);
  }

  @Patch('card-orders/:orderId/status')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Update order status' })
  @ApiResponse({ status: 200, description: 'Order status updated successfully', type: OrderResponseDto })
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateOrderStatus(orderId, updateOrderStatusDto);
  }

  @Patch('card-orders/:orderId/rfid')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Assign RFID to order (auto-updates user table)' })
  @ApiResponse({ status: 200, description: 'RFID assigned successfully', type: OrderResponseDto })
  async assignRfid(
    @Param('orderId') orderId: string,
    @Body() assignRfidDto: AssignRfidDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.assignRfid(orderId, assignRfidDto);
  }

  @Patch('card-orders/:orderId/card-status')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Change card status' })
  @ApiResponse({ status: 200, description: 'Card status updated successfully', type: OrderResponseDto })
  async updateCardStatusByAdmin(
    @Param('orderId') orderId: string,
    @Body() updateCardStatusDto: UpdateCardStatusDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateCardStatusByAdmin(orderId, updateCardStatusDto);
  }

  // ========== Payment Verification ==========

  @Get('card-payments')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get all payment submissions' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully', type: PaginatedPaymentsResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'paymentStatus', required: false, type: String })
  @ApiQuery({ name: 'orderId', required: false, type: String })
  async getAllPayments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('orderId') orderId?: string,
  ): Promise<PaginatedPaymentsResponseDto> {
    return this.paymentService.getAllPayments(page, limit, paymentStatus, orderId);
  }

  @Get('card-payments/:paymentId')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Get payment details' })
  @ApiResponse({ status: 200, description: 'Payment retrieved successfully', type: PaymentResponseDto })
  async getPaymentById(@Param('paymentId') paymentId: string): Promise<PaymentResponseDto> {
    return this.paymentService.getPaymentById(paymentId);
  }

  @Patch('card-payments/:paymentId/verify')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Verify or reject payment submission' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully', type: PaymentResponseDto })
  async verifyPayment(
    @Request() req: JwtRequest,
    @Param('paymentId') paymentId: string,
    @Body() verifyPaymentDto: VerifyCardPaymentDto,
  ): Promise<PaymentResponseDto> {
    const adminUserId = req.user.s;
    return this.paymentService.verifyPayment(paymentId, verifyPaymentDto, adminUserId);
  }

  @Delete('card-payments/:paymentId')
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: '[Admin] Attempt to delete payment (will fail - audit compliance)' })
  @ApiResponse({ status: 403, description: 'Payment deletion forbidden' })
  async attemptDeletePayment(@Param('paymentId') paymentId: string): Promise<never> {
    return this.paymentService.attemptDelete(paymentId);
  }
}
