"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar";
import type { Profile } from "@/types/database";

export function MobileNav({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
        <span className="sr-only">Open navigation</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>Application navigation menu</SheetDescription>
          </SheetHeader>
          <div onClick={() => setOpen(false)}>
            <Sidebar profile={profile} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
