import Link from "next/link";
import { BookOpen, Users, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <BookOpen className="size-6" />
            <span className="text-xl font-bold">BookKeeper</span>
          </div>
          <Link href="/login">
            <Button>Sign In</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Manage your Ruhi book inventory
            <br />
            <span className="text-muted-foreground">with your cluster team</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            BookKeeper helps institute coordinators and tutors track Ruhi study
            circle materials across storage locations. Know what books are
            available, where they are, and who needs them.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link href="/login">
              <Button size="lg">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="border-t bg-muted/50">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 md:grid-cols-3">
            <div className="space-y-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BookOpen className="size-5" />
              </div>
              <h3 className="text-lg font-semibold">Track Inventory</h3>
              <p className="text-sm text-muted-foreground">
                Keep an accurate count of every Ruhi book across all your
                storage locations. Update quantities as books move in and out.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <MapPin className="size-5" />
              </div>
              <h3 className="text-lg font-semibold">Multiple Locations</h3>
              <p className="text-sm text-muted-foreground">
                Manage books stored at homes, centers, and other locations.
                Transfer stock between sites with a clear audit trail.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Users className="size-5" />
              </div>
              <h3 className="text-lg font-semibold">Team Collaboration</h3>
              <p className="text-sm text-muted-foreground">
                Invite coordinators and tutors to your cluster. Tutors can
                request the books they need for their study circles.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-4 text-sm text-muted-foreground">
          BookKeeper &mdash; Built for the Ruhi Institute process
        </div>
      </footer>
    </div>
  );
}
