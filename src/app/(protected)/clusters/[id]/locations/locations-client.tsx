"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, MapPin, Phone, Mail, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createLocation,
  updateLocation,
  toggleLocationActive,
} from "@/app/actions/locations";
import type { StorageLocation } from "@/types/database";

type LocationWithCount = StorageLocation & { bookCount: number };

interface LocationsClientProps {
  clusterId: string;
  locations: LocationWithCount[];
  isAdmin: boolean;
}

export function LocationsClient({
  clusterId,
  locations,
  isAdmin,
}: LocationsClientProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StorageLocation | null>(
    null
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingLocation(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 size-4" />
              Add Location
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingLocation ? "Edit Location" : "Add Location"}
              </DialogTitle>
              <DialogDescription>
                {editingLocation
                  ? "Update the storage location details."
                  : "Add a new storage location to this cluster."}
              </DialogDescription>
            </DialogHeader>
            <LocationForm
              clusterId={clusterId}
              location={editingLocation}
              onDone={() => {
                setFormOpen(false);
                setEditingLocation(null);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="mb-4 size-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold">No locations yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add storage locations where books are kept.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((loc) => (
            <Card key={loc.id} className={!loc.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{loc.name}</CardTitle>
                    {loc.address && (
                      <CardDescription className="mt-1">
                        {loc.address}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={loc.is_active ? "default" : "secondary"}>
                      {loc.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {loc.bookCount} books
                  </span>
                </div>

                {(loc.contact_name || loc.contact_phone || loc.contact_email) && (
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {loc.contact_name && <p>{loc.contact_name}</p>}
                    {loc.contact_phone && (
                      <p className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {loc.contact_phone}
                      </p>
                    )}
                    {loc.contact_email && (
                      <p className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {loc.contact_email}
                      </p>
                    )}
                  </div>
                )}

                {loc.notes && (
                  <p className="text-xs text-muted-foreground">{loc.notes}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingLocation(loc);
                      setFormOpen(true);
                    }}
                  >
                    <Edit className="mr-1 size-3" />
                    Edit
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const result = await toggleLocationActive(
                          loc.id,
                          !loc.is_active
                        );
                        if (result.error) {
                          toast.error(result.error);
                        } else {
                          toast.success(
                            loc.is_active
                              ? "Location deactivated"
                              : "Location activated"
                          );
                        }
                      }}
                    >
                      {loc.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LocationForm({
  clusterId,
  location,
  onDone,
}: {
  clusterId: string;
  location: StorageLocation | null;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [contactName, setContactName] = useState(
    location?.contact_name ?? ""
  );
  const [contactPhone, setContactPhone] = useState(
    location?.contact_phone ?? ""
  );
  const [contactEmail, setContactEmail] = useState(
    location?.contact_email ?? ""
  );
  const [notes, setNotes] = useState(location?.notes ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setLoading(true);
    const formData = {
      name: name.trim(),
      address: address || null,
      contact_name: contactName || null,
      contact_phone: contactPhone || null,
      contact_email: contactEmail || null,
      notes: notes || null,
    };

    const result = location
      ? await updateLocation(location.id, formData)
      : await createLocation({ ...formData, cluster_id: clusterId });

    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(location ? "Location updated" : "Location created");
      onDone();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Baha'i Center"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Address</Label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Contact Name</Label>
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Contact Phone</Label>
          <Input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Contact Email</Label>
        <Input
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes"
          rows={2}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading
          ? location
            ? "Updating..."
            : "Creating..."
          : location
            ? "Update Location"
            : "Create Location"}
      </Button>
    </form>
  );
}
