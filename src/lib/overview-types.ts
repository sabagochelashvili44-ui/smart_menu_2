import type { OverviewLane } from "@/lib/overview-ops";

export type OverviewHourBucket = {
  hour: number;
  label: string;
  orders: number;
  isPeak: boolean;
};

export type OverviewCategoryShare = {
  category: string;
  revenue: number;
  percent: number;
};

export type OverviewReview = {
  id: string;
  tableId?: string;
  tableNumber: string;
  rating: number;
  comment: string;
  orderedItems: { name: string; quantity: number }[];
  created_at: string;
};

export type OverviewReviewBreakdown = {
  rating: 1 | 2 | 3 | 4 | 5;
  count: number;
  reviews: OverviewReview[];
};

export type OverviewLaneSnapshot = {
  revenue: number;
  revenueDishes: number;
  revenueFee: number;
  orderCount: number;
  pendingCalls: number;
  pendingOpenedToday: number;
  pendingLeftover: number;
  aov: number;
  hourly: OverviewHourBucket[];
  categories: OverviewCategoryShare[];
  topToday: { id: string; name: string; qty: number }[];
  reviewsToday: OverviewReview[];
  reviewBreakdown: OverviewReviewBreakdown[];
};

export type OverviewSnapshot = {
  hoursLabel: string;
  windowFrom: string;
  windowTo: string;
  window: string;
  food: OverviewLaneSnapshot;
  bar: OverviewLaneSnapshot;
};

export function emptyOverviewLane(): OverviewLaneSnapshot {
  return {
    revenue: 0,
    revenueDishes: 0,
    revenueFee: 0,
    orderCount: 0,
    pendingCalls: 0,
    pendingOpenedToday: 0,
    pendingLeftover: 0,
    aov: 0,
    hourly: [],
    categories: [],
    topToday: [],
    reviewsToday: [],
    reviewBreakdown: [5, 4, 3, 2, 1].map((rating) => ({
      rating: rating as 1 | 2 | 3 | 4 | 5,
      count: 0,
      reviews: [],
    })),
  };
}

export function emptyOverviewSnapshot(): OverviewSnapshot {
  return {
    hoursLabel: "",
    windowFrom: "",
    windowTo: "",
    window: "today",
    food: emptyOverviewLane(),
    bar: emptyOverviewLane(),
  };
}

export type { OverviewLane };
