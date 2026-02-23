import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card } from '../entities/card.entity';
import { CreateCardDto } from '../dto/create-card.dto';
import { UpdateCardDto } from '../dto/update-card.dto';
import { CardResponseDto, PaginatedCardsResponseDto } from '../dto/response/card-response.dto';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class CardService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
  ) {}

  async create(createCardDto: CreateCardDto): Promise<CardResponseDto> {
    const timestamp = now();
    const card = this.cardRepository.create({
      ...createCardDto,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const savedCard = await this.cardRepository.save(card);
    return this.toResponseDto(savedCard);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    isActive?: boolean,
  ): Promise<PaginatedCardsResponseDto> {
    const query = this.cardRepository.createQueryBuilder('card');

    if (isActive !== undefined) {
      query.where('card.isActive = :isActive', { isActive });
    }

    const [cards, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('card.createdAt', 'DESC')
      .getManyAndCount();

    return {
      data: cards.map(card => this.toResponseDto(card)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string): Promise<CardResponseDto> {
    const card = await this.cardRepository.findOne({ where: { id } });
    
    if (!card) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }

    return this.toResponseDto(card);
  }

  async update(id: string, updateCardDto: UpdateCardDto): Promise<CardResponseDto> {
    const card = await this.cardRepository.findOne({ where: { id } });
    
    if (!card) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }

    Object.assign(card, updateCardDto);
    card.updatedAt = now();
    const updatedCard = await this.cardRepository.save(card);
    
    return this.toResponseDto(updatedCard);
  }

  async remove(id: string): Promise<{ message: string }> {
    const card = await this.cardRepository.findOne({ where: { id } });
    
    if (!card) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }

    // Soft delete by setting isActive to false
    card.isActive = false;
    card.updatedAt = now();
    await this.cardRepository.save(card);

    return { message: 'Card deactivated successfully' };
  }

  async getActiveCards(): Promise<CardResponseDto[]> {
    const cards = await this.cardRepository.find({
      where: { isActive: true },
      order: { cardType: 'ASC', price: 'ASC' },
    });

    return cards.map(card => this.toResponseDto(card));
  }

  private toResponseDto(card: Card): CardResponseDto {
    return {
      id: card.id,
      cardName: card.cardName,
      cardType: card.cardType,
      cardImageUrl: card.cardImageUrl || undefined,
      cardVideoUrl: card.cardVideoUrl || undefined,
      description: card.description || undefined,
      price: Number(card.price),
      quantityAvailable: card.quantityAvailable,
      validityDays: card.validityDays,
      isActive: card.isActive,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }
}
