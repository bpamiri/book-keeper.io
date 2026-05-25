"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BOOK_LANGUAGES, DEFAULT_BOOK_LANGUAGE } from "@/lib/languages";
import type { BookLanguage } from "@/types/database";

interface LanguagePickerProps {
  value: BookLanguage;
  onChange: (value: BookLanguage) => void;
  disabled?: boolean;
  className?: string;
}

export function LanguagePicker({
  value,
  onChange,
  disabled,
  className,
}: LanguagePickerProps) {
  return (
    <Select
      value={value ?? DEFAULT_BOOK_LANGUAGE}
      onValueChange={(v) => onChange(v as BookLanguage)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Language" />
      </SelectTrigger>
      <SelectContent>
        {BOOK_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {lang}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
