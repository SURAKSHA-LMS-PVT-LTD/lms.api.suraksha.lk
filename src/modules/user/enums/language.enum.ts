/**
 * Language Enum
 * Supported languages for the LMS system
 * 
 * Values:
 * - S: Sinhala (සිංහල)
 * - E: English
 * - T: Tamil (தமிழ்)
 */
export enum Language {
  SINHALA = 'S',
  ENGLISH = 'E',
  TAMIL = 'T'
}

/**
 * Language display names for UI
 */
export const LanguageDisplayNames: Record<Language, string> = {
  [Language.SINHALA]: 'Sinhala (සිංහල)',
  [Language.ENGLISH]: 'English',
  [Language.TAMIL]: 'Tamil (தமிழ்)'
};

/**
 * Language full names
 */
export const LanguageFullNames: Record<Language, string> = {
  [Language.SINHALA]: 'Sinhala',
  [Language.ENGLISH]: 'English',
  [Language.TAMIL]: 'Tamil'
};

/**
 * Valid language values for validation
 */
export const VALID_LANGUAGES = [Language.SINHALA, Language.ENGLISH, Language.TAMIL] as const;

/**
 * Default language for new users
 */
export const DEFAULT_LANGUAGE = Language.ENGLISH;
