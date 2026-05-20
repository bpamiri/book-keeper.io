"use client";

import { useState } from "react";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { changePassword, requestEmailChange } from "@/app/actions/auth";

interface AccountClientProps {
  currentEmail: string;
  pendingEmail: string | null;
}

export function AccountClient({
  currentEmail,
  pendingEmail,
}: AccountClientProps) {
  return (
    <div className="space-y-6">
      <EmailCard
        currentEmail={currentEmail}
        pendingEmail={pendingEmail}
      />
      <PasswordCard />
    </div>
  );
}

function EmailCard({
  currentEmail,
  pendingEmail,
}: {
  currentEmail: string;
  pendingEmail: string | null;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(pendingEmail);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("Enter a new email address");
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      toast.error("New email is the same as your current email");
      return;
    }

    setLoading(true);
    const result = await requestEmailChange(trimmed);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Verification email sent to ${trimmed}`);
    setSentTo(result.pendingEmail ?? trimmed);
    setEmail("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="size-5" />
          <CardTitle>Email Address</CardTitle>
        </div>
        <CardDescription>
          Changing your email sends a verification link to the new address.
          Your email will only update after you confirm it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Current email</Label>
          <Input value={currentEmail} disabled readOnly />
        </div>

        {sentTo && (
          <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm dark:border-blue-700 dark:bg-blue-950/30">
            <p className="font-medium text-blue-800 dark:text-blue-200">
              Verification pending
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              We sent a verification link to <strong>{sentTo}</strong>. Click
              it to finish updating your email.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-email">New email</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send verification email
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (currentPassword === newPassword) {
      toast.error("New password must differ from current password");
      return;
    }

    setLoading(true);
    const result = await changePassword(currentPassword, newPassword);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Password updated");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="size-5" />
          <CardTitle>Password</CardTitle>
        </div>
        <CardDescription>
          Choose a strong password with at least 6 characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
