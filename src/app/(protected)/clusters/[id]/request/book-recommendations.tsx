import {
  Lightbulb,
  TrendingUp,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Recommendation } from "./page";

const categoryConfig: Record<
  string,
  { icon: typeof Lightbulb; color: string }
> = {
  high_demand: {
    icon: TrendingUp,
    color: "text-orange-600 dark:text-orange-400",
  },
  sequence_gap: {
    icon: BookOpen,
    color: "text-blue-600 dark:text-blue-400",
  },
  discovery: {
    icon: Sparkles,
    color: "text-purple-600 dark:text-purple-400",
  },
};

export function BookRecommendations({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="size-4 text-yellow-600 dark:text-yellow-400" />
          <CardTitle className="text-base">Recommendations</CardTitle>
        </div>
        <CardDescription>
          Books you may want to request based on usage patterns.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.map((rec) => {
          const config = categoryConfig[rec.category] ?? {
            icon: Lightbulb,
            color: "text-muted-foreground",
          };
          const Icon = config.icon;

          return (
            <div
              key={rec.bookId}
              className="flex items-start gap-3 rounded-md border p-2.5"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {rec.bookNumber
                      ? `Book ${rec.bookNumber}`
                      : rec.bookTitle}
                  </p>
                  {rec.available === 0 ? (
                    <Badge
                      variant="destructive"
                      className="text-[10px] px-1.5 py-0"
                    >
                      Out of stock
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {rec.available} left
                    </Badge>
                  )}
                </div>
                {rec.bookNumber && (
                  <p className="text-xs text-muted-foreground truncate">
                    {rec.bookTitle}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rec.reason}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
