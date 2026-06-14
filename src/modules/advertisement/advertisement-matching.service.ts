import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdvertisementEntity } from './entities/advertisement.entity';
import { UserType } from '../user/enums/user-type.enum';
import { Gender } from '../user/enums/gender.enum';
import { SubscriptionPlan } from '../user/enums/subscription-plan.enum';
import { Province } from '../user/enums/province.enum';
import { District } from '../user/enums/district.enum';
import { Occupation } from '../user/enums/occupation.enum';
import { AdvertisementCacheService } from './services/advertisement-cache.service';

export interface UserProfile {
  userId: string;
  userType: UserType;
  subscriptionPlan: SubscriptionPlan;
  instituteId?: string;
  city?: string;
  province?: Province;
  district?: District;
  birthYear?: number;
  gender?: Gender;
  occupation?: Occupation;
}

export interface AdvertisementMatch {
  advertisement: AdvertisementEntity;
  matchScore: number;
  matchReasons: string[];
}

@Injectable()
export class AdvertisementMatchingService {
  private readonly logger = new Logger(AdvertisementMatchingService.name);

  constructor(
    @InjectRepository(AdvertisementEntity)
    private advertisementRepository: Repository<AdvertisementEntity>,
    private advertisementCacheService: AdvertisementCacheService,
  ) {}

  /**
   * Find the most matching advertisements for a user profile
   * @param userProfile User profile data for matching
   * @param limit Maximum number of advertisements to return
   * @returns Array of matched advertisements with scores
   */
  async findMostMatchingAdvertisements(
    userProfile: UserProfile,
    limit: number = 10
  ): Promise<AdvertisementMatch[]> {
    try {
      // Get all active advertisements from cache (12-hour TTL + 5 AM daily refresh)
      // This will query database if cache is empty/expired
      const activeAds = await this.advertisementCacheService.getActiveAdvertisements();
      
      if (activeAds.length === 0) {
        this.logger.warn('❌ No active advertisements available for matching');
        this.logger.warn('   This means database returned 0 results');
        return [];
      }

      // Calculate match scores for each advertisement
      const matches = activeAds
        .map(ad => this.calculateMatchScore(ad, userProfile))
        .filter(match => match.matchScore > 0)
        .sort((a, b) => {
          // Sort by match score (descending), then by priority (descending)
          if (b.matchScore !== a.matchScore) {
            return b.matchScore - a.matchScore;
          }
          return b.advertisement.priority - a.advertisement.priority;
        })
        .slice(0, limit);
      
      return matches;
    } catch (error) {
      this.logger.error(`Error finding matching advertisements: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * Calculate match score between an advertisement and user profile
   * @param advertisement Advertisement to evaluate
   * @param userProfile User profile for matching
   * @returns Match result with score and reasons
   */
  private calculateMatchScore(
    advertisement: AdvertisementEntity,
    userProfile: UserProfile
  ): AdvertisementMatch {
    let score = 0;
    const reasons: string[] = [];

    // Base score for active advertisement
    if (this.isAdvertisementActive(advertisement)) {
      score += 10;
      reasons.push('Advertisement is active');
    } else {
      return { advertisement, matchScore: 0, matchReasons: ['Advertisement is not active'] };
    }

    // Check if advertisement can still send (within maxSendings limit)
    if (!this.canAdvertisementSend(advertisement)) {
      return { advertisement, matchScore: 0, matchReasons: ['Advertisement reached maximum sendings'] };
    }

    // User Type Matching (High Priority - 30 points)
    if (this.matchesUserType(advertisement, userProfile)) {
      score += 30;
      reasons.push(`Matches user type: ${userProfile.userType}`);
    } else if (advertisement.targetUserTypes && advertisement.targetUserTypes.length > 0) {
      // If ad has specific user type targeting but doesn't match, reduce score significantly
      score -= 20;
      reasons.push(`Does not match target user types: ${advertisement.targetUserTypes.join(', ')}`);
    }

    // Subscription Plan Matching (High Priority - 25 points)
    if (this.matchesSubscriptionPlan(advertisement, userProfile)) {
      score += 25;
      reasons.push(`Matches subscription plan: ${userProfile.subscriptionPlan}`);
    } else if (advertisement.targetSubscriptionPlans && advertisement.targetSubscriptionPlans.length > 0) {
      score -= 15;
      reasons.push(`Does not match target subscription plans: ${advertisement.targetSubscriptionPlans.join(', ')}`);
    }

    // Geographic Matching (Medium Priority - 20 points total)
    const geoScore = this.calculateGeographicScore(advertisement, userProfile);
    score += geoScore.score;
    reasons.push(...geoScore.reasons);

    // Age Matching (Medium Priority - 15 points)
    if (this.matchesAge(advertisement, userProfile)) {
      score += 15;
      reasons.push(`Matches age range: ${advertisement.minBornYear}-${advertisement.maxBornYear}`);
    } else if (advertisement.minBornYear || advertisement.maxBornYear) {
      score -= 10;
      reasons.push(`Does not match age range`);
    }

    // Gender Matching (Medium Priority - 10 points)
    if (this.matchesGender(advertisement, userProfile)) {
      score += 10;
      reasons.push(`Matches gender: ${userProfile.gender}`);
    } else if (advertisement.targetGenders && advertisement.targetGenders.length > 0) {
      score -= 5;
      reasons.push(`Does not match target genders: ${advertisement.targetGenders.join(', ')}`);
    }

    // Occupation Matching (Low Priority - 8 points)
    if (this.matchesOccupation(advertisement, userProfile)) {
      score += 8;
      reasons.push(`Matches occupation: ${userProfile.occupation}`);
    }

    // Priority Bonus (5 points max)
    const priorityBonus = Math.min(advertisement.priority, 5);
    score += priorityBonus;
    reasons.push(`Priority bonus: ${priorityBonus}`);

    // Freshness Bonus (newer ads get slight preference)
    const daysSinceCreated = Math.floor(
      (Date.now() - advertisement.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCreated <= 7) {
      score += 3;
      reasons.push('Recent advertisement bonus');
    }

    // Ensure minimum score is 0
    score = Math.max(0, score);

    return {
      advertisement,
      matchScore: score,
      matchReasons: reasons
    };
  }

  /**
   * Check if advertisement matches user type
   */
  private matchesUserType(advertisement: AdvertisementEntity, userProfile: UserProfile): boolean {
    if (!advertisement.targetUserTypes || advertisement.targetUserTypes.length === 0) {
      return true; // No specific targeting means it matches everyone
    }
    return advertisement.targetUserTypes.includes(userProfile.userType);
  }

  /**
   * Check if advertisement matches subscription plan
   */
  private matchesSubscriptionPlan(advertisement: AdvertisementEntity, userProfile: UserProfile): boolean {
    if (!advertisement.targetSubscriptionPlans || advertisement.targetSubscriptionPlans.length === 0) {
      return true; // No specific targeting means it matches everyone
    }
    return advertisement.targetSubscriptionPlans.includes(userProfile.subscriptionPlan);
  }

  /**
   * Calculate geographic matching score
   */
  private calculateGeographicScore(advertisement: AdvertisementEntity, userProfile: UserProfile): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // Institute matching (highest geographic priority)
    if (advertisement.targetInstituteIds && advertisement.targetInstituteIds.length > 0) {
      if (userProfile.instituteId && advertisement.targetInstituteIds.includes(userProfile.instituteId)) {
        score += 15;
        reasons.push(`Matches institute: ${userProfile.instituteId}`);
      } else {
        score -= 10;
        reasons.push('Does not match target institutes');
        return { score, reasons }; // If institute targeting fails, don't check other geo criteria
      }
    }

    // City matching
    if (advertisement.targetCities && advertisement.targetCities.length > 0) {
      if (userProfile.city && advertisement.targetCities.includes(userProfile.city)) {
        score += 8;
        reasons.push(`Matches city: ${userProfile.city}`);
      } else {
        score -= 5;
        reasons.push('Does not match target cities');
      }
    }

    // District matching
    if (advertisement.targetDistricts && advertisement.targetDistricts.length > 0) {
      if (userProfile.district && advertisement.targetDistricts.includes(userProfile.district)) {
        score += 6;
        reasons.push(`Matches district: ${userProfile.district}`);
      } else {
        score -= 3;
        reasons.push('Does not match target districts');
      }
    }

    // Province matching
    if (advertisement.targetProvinces && advertisement.targetProvinces.length > 0) {
      if (userProfile.province && advertisement.targetProvinces.includes(userProfile.province)) {
        score += 4;
        reasons.push(`Matches province: ${userProfile.province}`);
      } else {
        score -= 2;
        reasons.push('Does not match target provinces');
      }
    }

    return { score, reasons };
  }

  /**
   * Check if advertisement matches age range
   */
  private matchesAge(advertisement: AdvertisementEntity, userProfile: UserProfile): boolean {
    if (!advertisement.minBornYear && !advertisement.maxBornYear) {
      return true; // No age targeting
    }

    if (!userProfile.birthYear) {
      return false; // Can't match if birth year is unknown
    }

    const minYear = advertisement.minBornYear || 0;
    const maxYear = advertisement.maxBornYear || 9999;

    return userProfile.birthYear >= minYear && userProfile.birthYear <= maxYear;
  }

  /**
   * Check if advertisement matches gender
   */
  private matchesGender(advertisement: AdvertisementEntity, userProfile: UserProfile): boolean {
    if (!advertisement.targetGenders || advertisement.targetGenders.length === 0) {
      return true; // No gender targeting
    }

    if (!userProfile.gender) {
      return false; // Can't match if gender is unknown
    }

    return advertisement.targetGenders.includes(userProfile.gender);
  }

  /**
   * Check if advertisement matches occupation
   */
  private matchesOccupation(advertisement: AdvertisementEntity, userProfile: UserProfile): boolean {
    if (!advertisement.targetOccupations || advertisement.targetOccupations.length === 0) {
      return true; // No occupation targeting
    }

    if (!userProfile.occupation) {
      return false; // Can't match if occupation is unknown
    }

    // BUG-8 FIX: Use exact case-insensitive enum match instead of substring .includes()
    // Substring matching caused false positives (e.g. "Doctor" matched "Contractor")
    return advertisement.targetOccupations.some(
      targetOccupation =>
        targetOccupation.toLowerCase() === userProfile.occupation.toLowerCase()
    );
  }

  /**
   * Get all active advertisements that can still send
   */
  // ✅ REMOVED: Dead private getActiveAdvertisements() method.
  // This service uses advertisementCacheService.getActiveAdvertisements() instead (line ~62).

  /**
   * Record advertisement impression and increment counter atomically
   * ✅ FIXED: Uses atomic increment() instead of findOne+save to prevent race conditions.
   * Only increments impressionCount — currentSendings is tracked by AdvertisementCacheService.
   */
  async recordImpression(advertisementId: string, userProfile: UserProfile): Promise<void> {
    try {
      await this.advertisementRepository.increment(
        { id: advertisementId },
        'impressionCount',
        1,
      );
    } catch (error) {
      this.logger.error(`Error recording impression: ${error.message}`, error.stack);
    }
  }

  /**
   * Record advertisement click atomically
   * ✅ FIXED: Uses atomic increment() instead of findOne+save to prevent race conditions.
   */
  async recordClick(advertisementId: string, userProfile: UserProfile): Promise<void> {
    try {
      await this.advertisementRepository.increment(
        { id: advertisementId },
        'clickCount',
        1,
      );
    } catch (error) {
      this.logger.error(`Error recording click: ${error.message}`, error.stack);
    }
  }

  /**
   * Get advertisement analytics and performance metrics
   */
  async getAdvertisementAnalytics(advertisementId: string): Promise<any> {
    try {
      // Optimize: Select only fields needed for analytics
      const advertisement = await this.advertisementRepository.findOne({
        where: { id: advertisementId },
        select: [
          'id', 'title', 'impressionCount', 'clickCount', 'currentSendings', 
          'maxSendings', 'priority', 'startDate', 'endDate'
        ]
      });

      if (!advertisement) {
        return null;
      }

      const clickThroughRate = advertisement.impressionCount > 0 
        ? (advertisement.clickCount / advertisement.impressionCount) * 100 
        : 0;

      const completionRate = advertisement.maxSendings > 0
        ? (advertisement.currentSendings / advertisement.maxSendings) * 100
        : 0;

      const daysActive = Math.floor(
        (Date.now() - advertisement.startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: advertisement.id,
        title: advertisement.title,
        impressions: advertisement.impressionCount,
        clicks: advertisement.clickCount,
        clickThroughRate: parseFloat(clickThroughRate.toFixed(2)),
        currentSendings: advertisement.currentSendings,
        maxSendings: advertisement.maxSendings,
        completionRate: parseFloat(completionRate.toFixed(2)),
        daysActive,
        isActive: this.isAdvertisementActive(advertisement),
        canSend: this.canAdvertisementSend(advertisement),
        priority: advertisement.priority,
        startDate: advertisement.startDate,
        endDate: advertisement.endDate
      };
    } catch (error) {
      this.logger.error(`Error getting analytics: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Check if advertisement is currently active
   */
  private isAdvertisementActive(advertisement: AdvertisementEntity): boolean {
    const now = new Date(); // real UTC for correct comparison with DB-stored dates
    return advertisement.isActive && 
           now >= advertisement.startDate && 
           now <= advertisement.endDate &&
           advertisement.currentSendings < advertisement.maxSendings;
  }

  /**
   * Check if advertisement can still send (within limits)
   */
  private canAdvertisementSend(advertisement: AdvertisementEntity): boolean {
    return this.isAdvertisementActive(advertisement) && 
           advertisement.currentSendings < advertisement.maxSendings;
  }
}


