"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StorageLocation } from "@/types/database";

interface LocationPickerProps {
  value: string;
  onChange: (id: string) => void;
  locations: StorageLocation[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function LocationPicker({
  value,
  onChange,
  locations,
  disabled,
  placeholder = "Select a storage location",
  className,
}: LocationPickerProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {locations
          .filter((l) => l.is_active)
          .map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
