/**
 * CalendarDayCacheService Unit Tests
 * Verifies caching, expiration, cleanup, and OnModuleDestroy lifecycle
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CalendarDayCacheService } from './calendar-day-cache.service';

// Mock the InstituteCalendarService module entirely as it pulls in TypeORM entities
jest.mock('./institute-calendar.service', () => ({
  InstituteCalendarService: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { InstituteCalendarService } = require('./institute-calendar.service');

// Mock the timezone utility
jest.mock('../../../common/utils/timezone.util', () => ({
  getCurrentSriLankaDate: jest.fn(() => '2026-03-04'),
}));

// Mock the entity import (used in type-only position)
jest.mock('../entities/institute-calendar-day.entity', () => ({
  InstituteCalendarDayEntity: jest.fn(),
}));

// Mock the InstituteCalendarService methods
const mockCalendarService = {
  getOrCreateCalendarDay: jest.fn(),
  getDefaultEventForDay: jest.fn(),
};

describe('CalendarDayCacheService', () => {
  let service: CalendarDayCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarDayCacheService,
        { provide: InstituteCalendarService, useValue: mockCalendarService },
      ],
    }).compile();

    service = module.get<CalendarDayCacheService>(CalendarDayCacheService);

    // Setup default mock returns
    mockCalendarService.getOrCreateCalendarDay.mockResolvedValue({
      id: 1,
      date: '2026-03-04',
      dayType: 'SCHOOL_DAY',
    });
    mockCalendarService.getDefaultEventForDay.mockResolvedValue({
      id: 10,
      name: 'Default Event',
    });
  });

  afterEach(async () => {
    // Clean up interval to prevent leaks in tests
    service.onModuleDestroy();
  });

  describe('getCalendarDayForDate', () => {
    it('should fetch from DB on cache miss', async () => {
      const result = await service.getCalendarDayForDate('inst-1', '2026-03-04');

      expect(result.day).toBeDefined();
      expect(result.day.id).toBe(1);
      expect(result.defaultEventId).toBe('10');
      expect(mockCalendarService.getOrCreateCalendarDay).toHaveBeenCalledWith(
        'inst-1',
        '2026-03-04',
      );
    });

    it('should return cached value on cache hit', async () => {
      // First call — cache miss
      await service.getCalendarDayForDate('inst-1', '2026-03-04');
      expect(mockCalendarService.getOrCreateCalendarDay).toHaveBeenCalledTimes(1);

      // Second call — cache hit
      const result = await service.getCalendarDayForDate('inst-1', '2026-03-04');
      expect(result.day.id).toBe(1);
      // Should NOT call DB again
      expect(mockCalendarService.getOrCreateCalendarDay).toHaveBeenCalledTimes(1);
    });

    it('should handle null default event', async () => {
      mockCalendarService.getDefaultEventForDay.mockResolvedValue(null);

      const result = await service.getCalendarDayForDate('inst-1', '2026-03-04');
      expect(result.defaultEventId).toBeNull();
    });

    it('should handle getDefaultEventForDay error gracefully', async () => {
      mockCalendarService.getDefaultEventForDay.mockRejectedValue(
        new Error('DB error'),
      );

      const result = await service.getCalendarDayForDate('inst-1', '2026-03-04');
      expect(result.day).toBeDefined();
      expect(result.defaultEventId).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should remove cached entry for specific institute+date', async () => {
      // Populate cache
      await service.getCalendarDayForDate('inst-1', '2026-03-04');
      expect(service.getStats().size).toBe(1);

      // Invalidate
      service.invalidate('inst-1', '2026-03-04');
      expect(service.getStats().size).toBe(0);
    });

    it('should not affect other cache entries', async () => {
      await service.getCalendarDayForDate('inst-1', '2026-03-04');
      await service.getCalendarDayForDate('inst-2', '2026-03-04');
      expect(service.getStats().size).toBe(2);

      service.invalidate('inst-1', '2026-03-04');
      expect(service.getStats().size).toBe(1);
      expect(service.getStats().keys).toContain('inst-2_2026-03-04');
    });
  });

  describe('clear', () => {
    it('should remove all cached entries', async () => {
      await service.getCalendarDayForDate('inst-1', '2026-03-04');
      await service.getCalendarDayForDate('inst-2', '2026-03-05');
      expect(service.getStats().size).toBe(2);

      service.clear();
      expect(service.getStats().size).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct cache statistics', async () => {
      const empty = service.getStats();
      expect(empty.size).toBe(0);
      expect(empty.keys).toEqual([]);

      await service.getCalendarDayForDate('inst-1', '2026-03-04');
      const stats = service.getStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toContain('inst-1_2026-03-04');
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear the cleanup interval without throwing', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        service.onModuleDestroy();
        service.onModuleDestroy();
      }).not.toThrow();
    });
  });
});
