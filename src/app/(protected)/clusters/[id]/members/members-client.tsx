"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  inviteMember,
  updateMemberRole,
  removeMember,
} from "@/app/actions/members";
import type { ClusterMember, ClusterRole, Profile } from "@/types/database";

interface MembersClientProps {
  clusterId: string;
  currentUserId: string;
  isAdmin: boolean;
  activeMembers: ClusterMember[];
  pendingMembers: ClusterMember[];
  profileMap: Record<string, Profile>;
}

export function MembersClient({
  clusterId,
  currentUserId,
  isAdmin,
  activeMembers,
  pendingMembers,
  profileMap,
}: MembersClientProps) {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <InviteDialog
            clusterId={clusterId}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Active Members ({activeMembers.length})
        </h2>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                {isAdmin && <TableHead className="w-[80px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="h-24 text-center"
                  >
                    No active members.
                  </TableCell>
                </TableRow>
              ) : (
                activeMembers.map((member) => {
                  const profile = member.user_id
                    ? profileMap[member.user_id]
                    : null;
                  const isSelf = member.user_id === currentUserId;
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {profile?.full_name || "Unknown"}
                        {isSelf && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            member.cluster_role === "admin"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {member.cluster_role}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {member.joined_at
                          ? new Date(member.joined_at).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {!isSelf && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  ...
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const newRole: ClusterRole =
                                      member.cluster_role === "admin"
                                        ? "collaborator"
                                        : "admin";
                                    const result = await updateMemberRole(
                                      member.id,
                                      newRole
                                    );
                                    if (result.error) {
                                      toast.error(result.error);
                                    } else {
                                      toast.success(
                                        `Role changed to ${newRole}`
                                      );
                                    }
                                  }}
                                >
                                  {member.cluster_role === "admin"
                                    ? "Change to Collaborator"
                                    : "Promote to Admin"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={async () => {
                                    const result = await removeMember(
                                      member.id
                                    );
                                    if (result.error) {
                                      toast.error(result.error);
                                    } else {
                                      toast.success("Member removed");
                                    }
                                  }}
                                >
                                  <UserMinus className="mr-2 size-4" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {pendingMembers.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Pending Invites ({pendingMembers.length})
          </h2>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited</TableHead>
                  {isAdmin && (
                    <TableHead className="w-[80px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{member.cluster_role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(member.invited_at).toLocaleDateString()}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const result = await removeMember(member.id);
                            if (result.error) {
                              toast.error(result.error);
                            } else {
                              toast.success("Invitation revoked");
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteDialog({
  clusterId,
  open,
  onOpenChange,
}: {
  clusterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClusterRole>("collaborator");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setLoading(true);
    const result = await inviteMember({
      cluster_id: clusterId,
      email: email.trim(),
      cluster_role: role,
    });
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Invitation sent");
      onOpenChange(false);
      setEmail("");
      setRole("collaborator");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 size-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Send an email invitation to join this cluster.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as ClusterRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collaborator">Collaborator</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send Invitation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
