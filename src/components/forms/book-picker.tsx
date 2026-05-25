"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RuhiBook } from "@/types/database";

interface BookPickerProps {
  value: string;
  onChange: (id: string) => void;
  books: RuhiBook[];
  disabled?: boolean;
  className?: string;
}

export function BookPicker({
  value,
  onChange,
  books,
  disabled,
  className,
}: BookPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = books.find((b) => b.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? selected.title : "Select a book…"}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search books…" />
          <CommandList>
            <CommandEmpty>No book found.</CommandEmpty>
            <CommandGroup>
              {books
                .filter((b) => b.is_active)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((book) => (
                  <CommandItem
                    key={book.id}
                    value={book.title}
                    onSelect={() => {
                      onChange(book.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === book.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {book.title}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
