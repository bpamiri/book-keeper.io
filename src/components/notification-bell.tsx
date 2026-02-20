"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getNotifications, type Notification } from "@/app/actions/notifications";

const iconMap: Record<Notification["type"], typeof Bell> = {
  request_pending: Clock,
  request_approved: CheckCircle2,
  request_denied: XCircle,
  request_fulfilled: PackageCheck,
  low_stock: Bell,
  inventory_change: Bell,
};

const colorMap: Record<Notification["type"], string> = {
  request_pending: "text-yellow-600 dark:text-yellow-400",
  request_approved: "text-green-600 dark:text-green-400",
  request_denied: "text-red-600 dark:text-red-400",
  request_fulfilled: "text-blue-600 dark:text-blue-400",
  low_stock: "text-yellow-600 dark:text-yellow-400",
  inventory_change: "text-muted-foreground",
};

function timeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotifications().then((result) => {
      setNotifications(result.data);
      setLoading(false);
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.map((notification) => {
              const Icon = iconMap[notification.type];
              const color = colorMap[notification.type];
              return (
                <div
                  key={notification.id}
                  className="flex gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-accent/50"
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.description}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {timeAgo(notification.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
