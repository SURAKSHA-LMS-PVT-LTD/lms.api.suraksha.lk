export const NOTIFICATION_PACKAGES_CONFIG = {
  packages: {
    BASIC: {
      channels: ["telegram"],
      isAds: true,
      priority: 1,
      retryCount: 1,
      retryDelay: 10000
    },
    FREE: {
      channels: ["email", "sms" ,"telegram"],
      isAds: true,
      priority: 1,
      retryCount: 1,
      retryDelay: 10000
    },
    WHATSAPP: {
      channels: ["telegram"],
      isAds: true,
      retryCount: 2,
      retryDelay: 7000
    },
    TELEGRAM: {
      channels: ["telegram"],
      isAds: true,
      retryCount: 2,
      retryDelay: 7000
    },
    EMAIL: {
      channels: ["email"],
      isAds: true,
      retryCount: 2,
      retryDelay: 7000
    },
    PRO_WHATSAPP: {
      channels: ["whatsapp", "telegram", "email"],
      isAds: true,
      retryCount: 3,
      retryDelay: 5000
    },
    PRO_SMS: {
      channels: ["sms", "whatsapp", "email"],
      isAds: true,
      retryCount: 3,
      retryDelay: 5000
    },
    PRO_TELEGRAM: {
      channels: ["telegram", "whatsapp", "email"],
      isAds: true,
      retryCount: 3,
      retryDelay: 5000
    },
    PRO_EMAIL: {
      channels: ["email", "telegram"],
      isAds: false,
      retryCount: 3,
      retryDelay: 5000
    },
    DYNAMAD: {
      channels: ["whatsapp", "telegram", "email", "sms"],
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
    }
  }
};