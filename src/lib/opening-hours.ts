import {
  RESTAURANT_OFFSET,
  RESTAURANT_TZ,
  calendarDateInTbilisi,
  tbilisiDayEnd,
  tbilisiDayStart,
} from "@/lib/restaurant-day";

export type RestaurantHours = {
  hours_enabled?: boolean | null;
  hours_open?: string | null;
  hours_close?: string | null;
};

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export function parseHourClock(value: string | null | undefined) {
  const match = String(value ?? "").trim().match(TIME_RE);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatHourClock(value: string | null | undefined) {
  const minutes = parseHourClock(value);
  if (minutes == null) return "";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function tbilisiMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RESTAURANT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isRestaurantOpen(hours: RestaurantHours | null | undefined, now = new Date()) {
  if (!hours?.hours_enabled) return true;
  const open = parseHourClock(hours.hours_open);
  const close = parseHourClock(hours.hours_close);
  if (open == null || close == null || open === close) return true;
  const current = tbilisiMinutesNow(now);
  if (open < close) return current >= open && current < close;
  return current >= open || current < close;
}

export function restaurantHoursLabel(hours: RestaurantHours | null | undefined) {
  if (!hours?.hours_enabled) return "";
  const open = formatHourClock(hours.hours_open);
  const close = formatHourClock(hours.hours_close);
  if (!open || !close) return "";
  return `${open}–${close}`;
}

function padClock(value: number) {
  return String(value).padStart(2, "0");
}

function shiftTbilisiDate(ymd: string, days: number) {
  const noon = new Date(`${ymd}T12:00:00${RESTAURANT_OFFSET}`);
  return calendarDateInTbilisi(new Date(noon.getTime() + days * 86_400_000));
}

export function tbilisiDateAtMinutes(ymd: string, minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(
    `${ymd}T${padClock(hour)}:${padClock(minute)}:00${RESTAURANT_OFFSET}`,
  );
}

/** Today's service window: opening clock through closing clock (Tbilisi). */
export function operatingWindow(
  hours: RestaurantHours | null | undefined,
  now = new Date(),
) {
  const open = parseHourClock(hours?.hours_open);
  const close = parseHourClock(hours?.hours_close);
  if (!hours?.hours_enabled || open == null || close == null || open === close) {
    return { from: tbilisiDayStart(now), to: tbilisiDayEnd(now) };
  }

  const ymd = calendarDateInTbilisi(now);
  const current = tbilisiMinutesNow(now);

  if (open < close) {
    return {
      from: tbilisiDateAtMinutes(ymd, open),
      to: tbilisiDateAtMinutes(ymd, close),
    };
  }

  if (current >= open) {
    return {
      from: tbilisiDateAtMinutes(ymd, open),
      to: tbilisiDateAtMinutes(shiftTbilisiDate(ymd, 1), close),
    };
  }
  if (current < close) {
    return {
      from: tbilisiDateAtMinutes(shiftTbilisiDate(ymd, -1), open),
      to: tbilisiDateAtMinutes(ymd, close),
    };
  }
  return {
    from: tbilisiDateAtMinutes(ymd, open),
    to: tbilisiDateAtMinutes(shiftTbilisiDate(ymd, 1), close),
  };
}
