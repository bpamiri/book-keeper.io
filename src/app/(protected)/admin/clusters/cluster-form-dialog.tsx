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
import { createCluster, updateCluster } from "@/app/actions/clusters";
import { inviteMember } from "@/app/actions/members";
import type { Cluster } from "@/types/database";

interface ClusterFormDialogProps {
  mode: "create" | "edit";
  cluster?: Cluster;
  trigger?: React.ReactNode;
}

export function ClusterFormDialog({ mode, cluster, trigger }: ClusterFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const stateCode = (formData.get("stateCode") as string) || undefined;
    const subRegionCode = (formData.get("subRegionCode") as string) || undefined;
    const clusterNumberRaw = formData.get("clusterNumber") as string;
    const clusterNumber = clusterNumberRaw ? Number(clusterNumberRaw) : undefined;
    const description = (formData.get("description") as string) || undefined;

    if (mode === "edit" && cluster) {
      const result = await updateCluster(cluster.id, {
        name,
        state_code: stateCode || null,
        sub_region_code: subRegionCode || null,
        cluster_number: clusterNumber ?? null,
        description: description || null,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Cluster updated successfully");
        setOpen(false);
      }
    } else {
      const adminEmail = (formData.get("adminEmail") as string) || undefined;

      const result = await createCluster({
        name,
        state_code: stateCode || null,
        sub_region_code: subRegionCode || null,
        cluster_number: clusterNumber ?? null,
        description: description || null,
      });

      if (result.error) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      if (adminEmail && result.data) {
        const inviteResult = await inviteMember({
          cluster_id: result.data.id,
          email: adminEmail,
          cluster_role: "admin",
        });

        if (inviteResult.error) {
          toast.error(`Cluster created, but invite failed: ${inviteResult.error}`);
        } else {
          toast.success("Cluster created and admin invited");
        }
      } else {
        toast.success("Cluster created successfully");
      }

      setOpen(false);
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ? trigger : mode === "create" ? (
          <Button>
            <Plus className="mr-1 size-4" />
            Create Cluster
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" />
            <span className="sr-only">Edit</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Create Cluster" : "Edit Cluster"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Create a new geographic cluster. Optionally invite an initial admin."
                : "Update this cluster's details."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. North Atlanta"
                defaultValue={cluster?.name ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="stateCode">State Code *</Label>
                <Input
                  id="stateCode"
                  name="stateCode"
                  placeholder="CA"
                  maxLength={2}
                  className="uppercase"
                  defaultValue={cluster?.state_code ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subRegionCode">Sub-Region *</Label>
                <Input
                  id="subRegionCode"
                  name="subRegionCode"
                  placeholder="SE"
                  maxLength={2}
                  className="uppercase"
                  defaultValue={cluster?.sub_region_code ?? ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clusterNumber">Number *</Label>
                <Input
                  id="clusterNumber"
                  name="clusterNumber"
                  type="number"
                  min={1}
                  placeholder="5"
                  defaultValue={cluster?.cluster_number ?? ""}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Notes about this cluster"
                defaultValue={cluster?.description ?? ""}
              />
            </div>
            {mode === "create" && (
              <div className="space-y-2">
                <Label htmlFor="adminEmail">Initial Admin Email</Label>
                <Input
                  id="adminEmail"
                  name="adminEmail"
                  type="email"
                  placeholder="admin@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. An invite will be sent to this email.
                </p>
              </div>
            )}
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
                  ? "Create Cluster"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
