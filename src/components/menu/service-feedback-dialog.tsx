"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { parseGoogleReviewUrl } from "@/lib/google-review";
import type { MenuLocale } from "@/lib/menu-copy";
import { ui } from "@/lib/menu-copy";
import { StarIcon } from "lucide-react";
import { useState } from "react";

type Step = "rate" | "positive" | "thanks";

const PRIMARY_ACTION =
  "h-11 w-full bg-gradient-to-r from-primary to-[#a33a3a] text-primary-foreground shadow-sm hover:from-primary/90 hover:to-[#a33a3a]/90";

export function ServiceFeedbackDialog({
  open,
  onOpenChange,
  restaurantId,
  tableId,
  tableNumber,
  googleReviewUrl,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  googleReviewUrl: string | null | undefined;
  locale: MenuLocale;
}) {
  const copy = ui[locale];
  const [step, setStep] = useState<Step>("rate");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = hover || rating;
  const ratingHint = preview ? copy.feedbackRatingHint(preview) : "";
  const reviewUrl = parseGoogleReviewUrl(googleReviewUrl);

  function reset() {
    setStep("rate");
    setRating(0);
    setHover(0);
    setComment("");
    setSending(false);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function pickRating(stars: number) {
    setRating(stars);
    setError(null);
  }

  async function persistReview(stars: number, note: string) {
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        table_id: tableId,
        table_number: tableNumber,
        rating: stars,
        feedback: note.trim() || "—",
      }),
    });
  }

  async function submitFeedback() {
    if (sending || rating < 1) return;
    setSending(true);
    setError(null);
    const note = comment.trim() || "—";
    try {
      await persistReview(rating, note);
      if (rating <= 3) {
        const res = await fetch("/api/waiter-calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            restaurant_id: restaurantId,
            table_id: tableId,
            table_number: tableNumber,
            call_type: "low_rating",
            items: [
              {
                dish_id: "low_rating",
                name: copy.feedbackStaffAlert(tableNumber, rating, note),
                quantity: 1,
                unit_price: 0,
              },
            ],
          }),
        });
        const json = (await res.json()) as {
          call?: { id: string };
          error?: string;
        };
        if (!res.ok || !json.call) {
          setError(json.error ?? copy.callFail);
          return;
        }
        setStep("thanks");
        return;
      }
      if (reviewUrl) {
        window.open(reviewUrl, "_blank");
      }
      setStep("positive");
    } catch {
      setError(copy.callFail);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-5 rounded-2xl bg-popover/90 p-6 backdrop-blur-md sm:max-w-md">
        {step === "rate" ? (
          <>
            <DialogHeader className="text-center">
              <DialogTitle className="text-lg leading-snug">
                {copy.feedbackTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {copy.feedbackTitle}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center gap-1 py-1">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= preview;
                return (
                  <button
                    key={star}
                    type="button"
                    className="rounded-md p-1 transition-transform duration-200 hover:scale-110"
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => pickRating(star)}
                    aria-label={copy.feedbackStarLabel(star)}
                  >
                    <StarIcon
                      className={
                        filled
                          ? "size-9 fill-amber-500 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-transform duration-200"
                          : "size-9 text-muted-foreground transition-colors duration-200"
                      }
                    />
                  </button>
                );
              })}
            </div>
            <p
              className="text-muted-foreground min-h-6 text-center text-sm font-medium"
              aria-live="polite"
            >
              {ratingHint}
            </p>
            {rating > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{copy.feedbackCommentPrompt}</p>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={copy.feedbackCommentPlaceholder}
                  rows={4}
                  autoFocus
                />
                {error ? (
                  <p className="text-destructive text-sm">{error}</p>
                ) : null}
                <Button
                  type="button"
                  className={PRIMARY_ACTION}
                  onClick={() => void submitFeedback()}
                  disabled={sending}
                >
                  {sending ? copy.feedbackSending : copy.feedbackSubmit}
                </Button>
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground w-full"
              onClick={() => handleOpenChange(false)}
            >
              {copy.feedbackSkip}
            </Button>
          </>
        ) : null}

        {step === "positive" ? (
          <>
            <div className="flex flex-col items-center gap-3 pt-2">
              <GoogleReviewBadge />
              <DialogHeader className="text-center">
                <DialogTitle className="text-lg leading-snug">
                  {copy.feedbackPositive}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {copy.feedbackPositive}
                </DialogDescription>
              </DialogHeader>
            </div>
            {reviewUrl ? (
              <button
                type="button"
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#dadce0] bg-white text-sm font-semibold text-[#3c4043] shadow-[0_1px_2px_rgba(60,64,67,0.2),0_0_0_1px_rgba(66,133,244,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(66,133,244,0.22)]"
                onClick={() => window.open(reviewUrl, "_blank")}
              >
                <GoogleMark />
                {copy.feedbackGoogle}
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-xl border border-[#dadce0] bg-white/70 text-sm font-semibold text-[#3c4043]/50"
                >
                  <GoogleMark />
                  {copy.feedbackGoogle}
                </button>
                <p className="text-muted-foreground text-center text-xs">
                  {copy.feedbackGoogleMissing}
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground h-8 w-full text-xs font-normal"
              onClick={() => handleOpenChange(false)}
            >
              {copy.feedbackSkip}
            </Button>
          </>
        ) : null}

        {step === "thanks" ? (
          <>
            <DialogHeader className="text-center">
              <DialogTitle className="text-lg leading-snug">
                {copy.feedbackThanks}
              </DialogTitle>
            </DialogHeader>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground w-full"
              onClick={() => handleOpenChange(false)}
            >
              {copy.feedbackSkip}
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function GoogleMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className="size-6 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function GoogleReviewBadge() {
  return (
    <div className="relative flex size-16 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(66,133,244,0.28)] ring-1 ring-[#dadce0]">
      <GoogleMark />
      <StarIcon className="absolute -top-1 -right-1 size-4 fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
      <StarIcon className="absolute -bottom-0.5 -left-1 size-3.5 fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
      <StarIcon className="absolute top-0.5 -left-2 size-3 fill-amber-300 text-amber-300" />
    </div>
  );
}
