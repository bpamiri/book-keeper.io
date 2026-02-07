"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRuhiBook, updateRuhiBook } from "@/app/actions/admin";
import type {
  RuhiBook,
  BookCategory,
  PublicationStatus,
} from "@/types/database";

interface BookFormDialogProps {
  mode: "create" | "edit";
  book?: RuhiBook;
  trigger?: React.ReactNode;
}

export function BookFormDialog({ mode, book, trigger }: BookFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<BookCategory>(
    book?.category ?? "main_sequence"
  );
  const [pubStatus, setPubStatus] = useState<PublicationStatus>(
    book?.publication_status ?? "published"
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const bookNumber = formData.get("book_number") as string;
    const unit = (formData.get("unit") as string) || undefined;
    const language = (formData.get("language") as string) || "English";
    const description = (formData.get("description") as string) || undefined;
    const sortOrder = parseInt(formData.get("sort_order") as string, 10);
    const isActive = formData.get("is_active") === "on";

    const bookData = {
      title,
      book_number: bookNumber ? parseInt(bookNumber, 10) : null,
      category,
      publication_status: pubStatus,
      unit: unit || null,
      language,
      description: description || null,
      is_active: isActive,
      sort_order: isNaN(sortOrder) ? 0 : sortOrder,
    };

    if (mode === "edit" && book) {
      const result = await updateRuhiBook(book.id, bookData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Book updated successfully");
        setOpen(false);
      }
    } else {
      const result = await createRuhiBook(bookData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Book created successfully");
        setOpen(false);
      }
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : mode === "create" ? (
          <Button>
            <Plus className="mr-1 size-4" />
            Add Book
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" />
            <span className="sr-only">Edit</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Add Book" : "Edit Book"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Add a new book to the Ruhi catalog."
                : "Update this book's details."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                name="title"
                defaultValue={book?.title ?? ""}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="book_number">Book Number</Label>
                <Input
                  id="book_number"
                  name="book_number"
                  type="number"
                  defaultValue={book?.book_number ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sort_order">Sort Order *</Label>
                <Input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  defaultValue={book?.sort_order ?? 0}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as BookCategory)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main_sequence">Main Sequence</SelectItem>
                    <SelectItem value="branch_book3">
                      Branch (Book 3)
                    </SelectItem>
                    <SelectItem value="branch_book5">
                      Branch (Book 5)
                    </SelectItem>
                    <SelectItem value="junior_youth_text">
                      Junior Youth Text
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Publication Status</Label>
                <Select
                  value={pubStatus}
                  onValueChange={(v) => setPubStatus(v as PublicationStatus)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="pre_publication">
                      Pre-Publication
                    </SelectItem>
                    <SelectItem value="in_development">
                      In Development
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  name="unit"
                  defaultValue={book?.unit ?? ""}
                  placeholder="e.g. Unit 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Input
                  id="language"
                  name="language"
                  defaultValue={book?.language ?? "English"}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={book?.description ?? ""}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                defaultChecked={book?.is_active ?? true}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="is_active" className="font-normal">
                Active in catalog
              </Label>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Add Book"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
