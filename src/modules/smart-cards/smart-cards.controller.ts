import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { SystemAdminGuard } from '../user-card-management/guards/system-admin.guard';
import { SmartCardsService } from './smart-cards.service';
import {
  CreateSmartCardDto,
  BulkCreateSmartCardsDto,
  UpdateSmartCardDto,
  AssignCardsToInstituteDto,
  AssignCardsToClassDto,
  BulkAssignToClassByRangeDto,
  AssignCardToUserDto,
  ListSmartCardsQueryDto,
} from './dto/smart-card.dto';
import { SmartCardScope } from './enums/smart-card.enums';

function actorId(req: any): string {
  return req.user?.s ?? req.user?.userId ?? req.user?.sub ?? req.user?.id;
}

/**
 * SYSTEM ADMIN — pre-printed card inventory + allocation to institutes/classes.
 */
@ApiTags('Admin - Smart Cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SystemAdminGuard)
@Controller('admin/smart-cards')
export class AdminSmartCardsController {
  constructor(private readonly service: SmartCardsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Per-institute card stats (admin overview dashboard)' })
  adminStats() {
    return this.service.getAdminInstituteStats();
  }

  @Get()
  @ApiOperation({ summary: 'List / filter the card pool' })
  list(@Query() query: ListSmartCardsQueryDto) {
    return this.service.listCards(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single card' })
  create(@Body() dto: CreateSmartCardDto) {
    return this.service.createCard(dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk-create cards (list / numeric range / CSV)' })
  bulkCreate(@Body() dto: BulkCreateSmartCardsDto) {
    return this.service.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a card (name / type / activate-deactivate)' })
  update(@Param('id') id: string, @Body() dto: UpdateSmartCardDto) {
    return this.service.updateCard(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a card (only if not held by a user)' })
  remove(@Param('id') id: string) {
    return this.service.deleteCard(id);
  }

  @Post('assign-to-institute')
  @ApiOperation({ summary: 'Allocate cards to an institute' })
  assignToInstitute(@Body() dto: AssignCardsToInstituteDto) {
    return this.service.assignCardsToInstitute(dto);
  }

  @Post('institutes/:instituteId/assign-to-class')
  @ApiOperation({ summary: "Allocate an institute's cards to a class" })
  assignToClass(@Param('instituteId') instituteId: string, @Body() dto: AssignCardsToClassDto) {
    return this.service.assignCardsToClass(instituteId, dto);
  }

  @Post('institutes/:instituteId/assign-to-class-by-range')
  @ApiOperation({ summary: "Bulk-assign institute cards to a class by card-value range (cardIdMin–cardIdMax)" })
  assignToClassByRange(@Param('instituteId') instituteId: string, @Body() dto: BulkAssignToClassByRangeDto) {
    return this.service.bulkAssignToClassByRange(instituteId, dto);
  }
}

/**
 * INSTITUTE ADMIN — counts, search-their-pool, and assign a card to a user.
 * Every endpoint is gated on the smart-cards feature being enabled.
 */
@ApiTags('Institute - Smart Cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@Controller('institutes/:instituteId/smart-cards')
export class InstituteSmartCardsController {
  constructor(private readonly service: SmartCardsService) {}

  @Get('counts')
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiParam({ name: 'instituteId' })
  @ApiOperation({ summary: 'Counts of available / assigned cards by scope (no raw ids)' })
  async counts(@Param('instituteId') instituteId: string) {
    await this.service.assertFeatureEnabled(instituteId);
    return this.service.getInstituteCounts(instituteId);
  }

  @Get('search')
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: "Search the institute's own card pool by name/id" })
  async search(@Param('instituteId') instituteId: string, @Query() query: ListSmartCardsQueryDto) {
    await this.service.assertFeatureEnabled(instituteId);
    return this.service.searchInstitutePool(instituteId, query);
  }

  @Post('assign-to-user')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: 'Assign one card to a user (manual = cardValue, auto = omit)' })
  async assignToUser(
    @Param('instituteId') instituteId: string,
    @Body() dto: AssignCardToUserDto,
    @Request() req: any,
  ) {
    await this.service.assertFeatureEnabled(instituteId);
    const card = await this.service.assignCardToUser(instituteId, dto, actorId(req));
    return {
      success: true,
      message: `Card '${card.cardName}' (${card.cardId}) assigned successfully.`,
      card: { id: card.id, cardName: card.cardName, cardId: card.cardId, scope: card.scope, type: card.cardType },
    };
  }

  @Patch('revoke')
  @HttpCode(HttpStatus.OK)
  @RequireAnyOfRoles({ instituteAdmin: true })
  @ApiOperation({ summary: "Revoke a user's active card of a scope, returning it to the pool" })
  async revoke(
    @Param('instituteId') instituteId: string,
    @Body() body: { userId: string; scope: SmartCardScope },
  ) {
    await this.service.assertFeatureEnabled(instituteId);
    return this.service.revokeUserCard(instituteId, body.userId, body.scope);
  }
}
