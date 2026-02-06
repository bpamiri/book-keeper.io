"use client";

import { useState } from "react";
import { MoreHorizontal, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { promoteToAdmin, demoteFromAdmin } from "@/app/actions/admin";
import type { UserRole } from "@/types/database";

interface UserActionsProps {
  userId: string;
  currentRole: UserRole;
  isSelf: boolean;
}

export function UserActions({ userId, currentRole, isSelf }: UserActionsProps) {
  const [loading, setLoading] = useState(false);

  async function handlePromote() {
    setLoading(true);
    const result = await promoteToAdmin(userId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("User promoted to admin");
    }
    setLoading(false);
  }

  async function handleDemote() {
    setLoading(true);
    const result = await demoteFromAdmin(userId);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("User demoted from admin");
    }
    setLoading(false);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={loading}>
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {currentRole === "user" ? (
          <DropdownMenuItem onClick={handlePromote}>
            <ShieldCheck className="mr-2 size-4" />
            Promote to Admin
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={handleDemote}
            disabled={isSelf}
            variant="destructive"
          >
            <ShieldOff className="mr-2 size-4" />
            {isSelf ? "Cannot demote yourself" : "Demote from Admin"}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
