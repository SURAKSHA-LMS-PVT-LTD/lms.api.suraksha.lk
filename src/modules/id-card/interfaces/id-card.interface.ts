export interface IdCardTemplate {
  pageCount: number;
  firstPageDimensions: { width: number; height: number };
  secondPageDimensions?: { width: number; height: number };
}

export interface IdCardGenerationResult {
  userId: string;
  success: boolean;
  url?: string;
  error?: string;
}

export interface BulkIdCardGenerationResult {
  success: string[];
  failed: string[];
}

export interface IdCardDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IdCardTextElement {
  text: string;
  x: number;
  y: number;
  size: number;
  color: { r: number; g: number; b: number };
}

export interface IdCardImageElement {
  x: number;
  y: number;
  width: number;
  height: number;
}
