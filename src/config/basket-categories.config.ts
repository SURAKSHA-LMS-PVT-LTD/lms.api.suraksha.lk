export interface BasketCategoryConfig {
  displayName: string;
  description: string;
  examples: string[];
}

export const BASKET_CATEGORIES: Record<string, BasketCategoryConfig> = {
  LANGUAGE: {
    displayName: "Language Basket",
    description: "Students must choose one language subject",
    examples: [
      "Basket-English",
      "Basket-Tamil", 
      "Basket-Sinhala"
    ]
  },
  ARTS: {
    displayName: "Arts Basket",
    description: "Students must choose one arts subject", 
    examples: [
      "Basket-Music",
      "Basket-Dancing",
      "Basket-Drama"
    ]
  },
  TECHNOLOGY: {
    displayName: "Technology Basket",
    description: "Students must choose one technology subject",
    examples: [
      "Basket-IT",
      "Basket-Engineering Technology",
      "Basket-Science for Technology"
    ]
  },
  COMMERCE: {
    displayName: "Commerce Basket", 
    description: "Students must choose one commerce subject",
    examples: [
      "Basket-Accounting",
      "Basket-Business Studies",
      "Basket-Economics"
    ]
  },
  SCIENCE: {
    displayName: "Science Basket",
    description: "Students must choose one science subject",
    examples: [
      "Basket-Physics",
      "Basket-Chemistry", 
      "Basket-Biology"
    ]
  },
  RELIGION: {
    displayName: "Religion Basket",
    description: "Students must choose one religion subject",
    examples: [
      "Basket-Buddhism",
      "Basket-Christianity",
      "Basket-Hindu",
      "Basket-Islam"
    ]
  }
};
