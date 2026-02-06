"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { toggleBookActive } from "@/app/actions/admin";

interface BookActiveToggleProps {
  bookId: string;
  isActive: boolean;
}

export function BookActiveToggle({ bookId, isActive }: BookActiveToggleProps) {
  const [active, setActive] = useState(isActive);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    const newState = !active;
    setActive(newState);

    const result = await toggleBookActive(bookId, newState);
    if (result.error) {
      setActive(!newState);
      toast.error(result.error);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="cursor-pointer disabled:opacity-50"
    >
      <Badge variant={active ? "default" : "outline"}>
        {active ? "Active" : "Inactive"}
      </Badge>
    </button>
  );
}
