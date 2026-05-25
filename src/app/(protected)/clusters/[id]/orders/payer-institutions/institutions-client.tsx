"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createInstitution,
  updateInstitution,
} from "@/app/actions/payer_institutions";
import type { PayerInstitution } from "@/types/database";

interface InstitutionsClientProps {
  clusterId: string;
  institutions: PayerInstitution[];
}

export function InstitutionsClient({
  clusterId,
  institutions,
}: InstitutionsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createInstitution(clusterId, {
        name,
        description: description.trim() || null,
        sort_order: sortOrder,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Institution added");
      setName("");
      setDescription("");
      setSortOrder(0);
      setOpen(false);
      router.refresh();
    });
  };

  const toggleActive = (id: string, currentActive: boolean) => {
    startTransition(async () => {
      const result = await updateInstitution(id, { is_active: !currentActive });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <Link href={`/clusters/${clusterId}`} className="hover:underline">
              Cluster
            </Link>
            <span>/</span>
            <Link
              href={`/clusters/${clusterId}/orders`}
              className="hover:underline"
            >
              Orders
            </Link>
            <span>/</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Payer Institutions
          </h1>
          <p className="text-muted-foreground">
            Configure institutional payers (ATC, LSA, etc.) available on
            orders for this cluster.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            if (!o) {
              setName("");
              setDescription("");
              setSortOrder(0);
            }
            setOpen(o);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4" />
              Add institution
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add institution</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. LSA of Springfield"
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={pending || !name.trim()}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Institutions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Sort</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {institutions.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell>{inst.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {inst.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{inst.sort_order}</TableCell>
                  <TableCell>
                    {inst.is_active ? "Active" : "Inactive"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActive(inst.id, inst.is_active)}
                      disabled={pending}
                    >
                      {inst.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
