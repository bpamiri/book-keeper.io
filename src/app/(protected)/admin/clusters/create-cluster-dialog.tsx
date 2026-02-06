"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import { createCluster } from "@/app/actions/clusters";
import { inviteMember } from "@/app/actions/members";

export function CreateClusterDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const region = (formData.get("region") as string) || undefined;
    const description = (formData.get("description") as string) || undefined;
    const adminEmail = (formData.get("adminEmail") as string) || undefined;

    const result = await createCluster({
      name,
      region: region || null,
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

    setLoading(false);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 size-4" />
          Create Cluster
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Cluster</DialogTitle>
            <DialogDescription>
              Create a new geographic cluster. Optionally invite an initial
              admin.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. North Atlanta"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input
                id="region"
                name="region"
                placeholder="e.g. Southeast"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Notes about this cluster"
              />
            </div>
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
              {loading ? "Creating..." : "Create Cluster"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
