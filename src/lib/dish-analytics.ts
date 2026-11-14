import { isServiceFeeItem } from "@/lib/service-fee";

const FEE_NAME_RE =
  /მომსახურება|service\s*(fee|charge)|обслуживан/i;
const RATING_NAME_RE =
  /დაბალი შეფასება|low rating|низкая оценка|left a low rating|შეფასებაა|⚠️/;

export function isRatingAlertItem(item: {
  dish_id?: string | null;
  name?: string | null;
}) {
  const id = String(item.dish_id ?? "").trim().toLowerCase();
  if (id === "low_rating" || id === "rating") return true;
  return RATING_NAME_RE.test(String(item.name ?? ""));
}

export function isDishSaleItem(item: {
  dish_id?: string | null;
  name?: string | null;
}) {
  if (isServiceFeeItem(item) || isRatingAlertItem(item)) return false;
  const id = String(item.dish_id ?? "").trim().toLowerCase();
  if (id === "service_fee") return false;
  const name = String(item.name ?? "").trim();
  if (!name) return false;
  return !FEE_NAME_RE.test(name);
}

export function isRatingAlertCall(call: {
  call_type?: string | null;
  items?: Array<{ dish_id?: string | null; name?: string | null }>;
}) {
  if (call.call_type === "low_rating") return true;
  return (call.items ?? []).some((item) => isRatingAlertItem(item));
}

export function parseRatingAlert(name: string) {
  const match = String(name).match(/(\d)\s*\/\s*5/);
  const rating = match ? Number(match[1]) : 0;
  const commentMatch = String(name).match(/:\s*(.*)$/);
  const raw = String(commentMatch?.[1] ?? "").trim();
  const comment = raw === "—" || raw === "-" ? "" : raw;
  return {
    rating: rating >= 1 && rating <= 5 ? rating : 0,
    comment,
  };
}
