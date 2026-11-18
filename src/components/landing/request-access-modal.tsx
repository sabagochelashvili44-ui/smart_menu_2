"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RequestAccessModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormStatus = "idle" | "submitting" | "sent" | "error";

export function RequestAccessModal({
  open,
  onOpenChange,
}: RequestAccessModalProps) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          restaurant: String(data.get("restaurant") ?? ""),
          note: String(data.get("note") ?? ""),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not send your request.");
      }
      setStatus("sent");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send your request.");
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setStatus("idle");
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "max-w-md border border-white/10 bg-[#0c0d10]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-0 backdrop-blur-xl sm:max-w-md",
        )}
        overlayClassName="bg-black/60 supports-backdrop-filter:backdrop-blur-md"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-[-0.02em] text-white">
            Request access
          </DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Altatab is invitation-only for restaurants. Tell us about your venue
            and we&apos;ll follow up with membership details.
          </DialogDescription>
        </DialogHeader>

        {status === "sent" ? (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-5 text-sm leading-relaxed text-white/90">
            Thanks — your request was sent. Our team will reach out shortly.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="access-name" className="text-white/80">
                Full name
              </Label>
              <Input
                id="access-name"
                name="name"
                required
                autoComplete="name"
                disabled={status === "submitting"}
                className="h-10 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-cyan-400/50 focus-visible:ring-cyan-400/25"
                placeholder="Alex Rivera"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="access-email" className="text-white/80">
                Work email
              </Label>
              <Input
                id="access-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                disabled={status === "submitting"}
                className="h-10 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-cyan-400/50 focus-visible:ring-cyan-400/25"
                placeholder="you@restaurant.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="access-restaurant" className="text-white/80">
                Restaurant / group
              </Label>
              <Input
                id="access-restaurant"
                name="restaurant"
                required
                disabled={status === "submitting"}
                className="h-10 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-cyan-400/50 focus-visible:ring-cyan-400/25"
                placeholder="Aurora Bistro"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="access-note" className="text-white/80">
                Notes{" "}
                <span className="font-normal text-white/40">(optional)</span>
              </Label>
              <Textarea
                id="access-note"
                name="note"
                rows={3}
                disabled={status === "submitting"}
                className="min-h-20 border-white/15 bg-white/5 text-white placeholder:text-white/35 focus-visible:border-cyan-400/50 focus-visible:ring-cyan-400/25"
                placeholder="Locations, timeline, or questions…"
              />
            </div>
            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={status === "submitting"}
              className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-[#041016] transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" ? "Sending…" : "Submit request"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
