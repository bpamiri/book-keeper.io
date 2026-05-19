import type { BookLanguage } from "@/types/database";

export const BOOK_LANGUAGES: readonly BookLanguage[] = [
  "English",
  "Spanish",
  "Farsi",
  "Chinese",
] as const;

export const DEFAULT_BOOK_LANGUAGE: BookLanguage = "English";
