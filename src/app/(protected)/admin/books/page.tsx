import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Profile, RuhiBook } from "@/types/database";
import { BookFormDialog } from "./book-form-dialog";
import { BookActiveToggle } from "./book-active-toggle";
import { BookActions } from "./book-actions";

const categoryColors: Record<string, "default" | "secondary" | "outline"> = {
  main_sequence: "default",
  branch_book3: "secondary",
  branch_book5: "outline",
};

const categoryLabels: Record<string, string> = {
  main_sequence: "Main Sequence",
  branch_book3: "Branch (Book 3)",
  branch_book5: "Branch (Book 5)",
};

const statusVariants: Record<string, "default" | "secondary" | "outline"> = {
  published: "default",
  pre_publication: "secondary",
  in_development: "outline",
};

const statusLabels: Record<string, string> = {
  published: "Published",
  pre_publication: "Pre-Publication",
  in_development: "In Development",
};

export default async function AdminBooksPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const profile = rawProfile as unknown as Pick<Profile, "role"> | null;

  if (!profile || profile.role !== "platform_admin") {
    redirect("/dashboard");
  }

  const { data: rawBooks } = await supabase
    .from("ruhi_books")
    .select("*")
    .order("sort_order", { ascending: true });

  const books = (rawBooks ?? []) as RuhiBook[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Book Catalog</h1>
          <p className="text-muted-foreground">
            Manage the Ruhi book catalog used across all clusters.
          </p>
        </div>
        <BookFormDialog mode="create" />
      </div>

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No books in the catalog yet. Add one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden sm:table-cell w-[60px]">#</TableHead>
                <TableHead className="whitespace-normal">Title</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {books.map((book) => (
                <TableRow key={book.id}>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {book.book_number ?? book.sort_order}
                  </TableCell>
                  <TableCell className="font-medium whitespace-normal">
                    {book.title}
                    {(book.unit ||
                      book.language !== "English") && (
                      <p className="text-xs text-muted-foreground font-normal">
                        {[
                          book.unit,
                          book.language !== "English" ? book.language : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1 md:hidden">
                      <Badge
                        variant={categoryColors[book.category] ?? "outline"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {categoryLabels[book.category] ?? book.category}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={categoryColors[book.category] ?? "outline"}>
                      {categoryLabels[book.category] ?? book.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge
                      variant={
                        statusVariants[book.publication_status] ?? "outline"
                      }
                    >
                      {statusLabels[book.publication_status] ??
                        book.publication_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <BookActiveToggle
                      bookId={book.id}
                      isActive={book.is_active}
                    />
                  </TableCell>
                  <TableCell>
                    <BookActions book={book} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
