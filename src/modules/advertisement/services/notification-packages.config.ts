export const NOTIFICATION_PACKAGES_CONFIG = {
  packages: {
    // ─── Base Plans ──────────────────────────────────────────────────────────
    // ─── Ad eligibility rule ─────────────────────────────────────────────────
    // Only plans that carry an ad package run the advertisement path. FREE and the
    // base single-channel plans do NOT receive ads, so attendance marking for those
    // users skips the ad lookup entirely (no daily-assignment read, no send).
    // Currently only DYNAMAD carries ads. Flip a plan's isAds to true to opt it in.
    FREE: {
      channels: ["whatsapp", "telegram", "email", "sms", "push"],
      isAds: false,
      priority: 1,
      retryCount: 1,
      retryDelay: 10000
    },
    WHATSAPP: {
      channels: ["whatsapp", "push"],
      isAds: false,
      retryCount: 2,
      retryDelay: 7000
    },
    TELEGRAM: {
      channels: ["telegram", "push"],
      isAds: false,
      retryCount: 2,
      retryDelay: 7000
    },
    EMAIL: {
      channels: ["email", "push"],
      isAds: false,
      retryCount: 2,
      retryDelay: 7000
    },
    // ─── PRO Plans (same channel as base, higher retries + priority) ─────────
    // Keys MUST match SubscriptionPlan enum values exactly (PRO-WHATSAPP not PRO_WHATSAPP)
    'PRO-WHATSAPP': {
      channels: ["whatsapp", "push"],
      isAds: false,
      retryCount: 3,
      retryDelay: 5000
    },
    'PRO-SMS': {
      channels: ["sms", "push"],
      isAds: false,
      retryCount: 3,
      retryDelay: 5000
    },
    'PRO-TELEGRAM': {
      channels: ["telegram", "push"],
      isAds: false,
      retryCount: 3,
      retryDelay: 5000
    },
    'PRO-EMAIL': {
      channels: ["email", "push"],
      isAds: false,
      retryCount: 3,
      retryDelay: 5000
    },
    // ─── DYNAMAD — all channels, all ads, maximum reach ──────────────────────
    DYNAMAD: {
      channels: ["whatsapp", "telegram", "email", "sms", "push"],
      isAds: true,
      retryCount: 3,
      retryDelay: 5000
    }
  },
  cost_optimization: {
    whatsapp: {
      base_cost: 0.005,
      media_multiplier: 1.5
    },
    telegram: {
      base_cost: 0.001,
      media_multiplier: 1.2
    },
    email: {
      base_cost: 0.0005,
      media_multiplier: 1.1
    },
    sms: {
      base_cost: 0.01,
      media_multiplier: 0
    },
    push: {
      base_cost: 0.0001,
      media_multiplier: 1.0
    }
  }
};