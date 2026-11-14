export type AnalyticsInsights = {
  weeklyFinance: string;
  menuOptimization: string;
  cartAbandonment: string;
  nextWeekActions: string;
  marginGrowth: string;
  behavioralInsights: string;
  operationalRisk: string;
  menuEngineering: string;
  wastePrevention: string;
  marginUpsell: string;
};

export function isEmptySalesMetrics(snapshot: {
  revenue?: number;
  orderCount?: number;
}) {
  return !(Number(snapshot.revenue) > 0 || Number(snapshot.orderCount) > 0);
}

export function placeholderInsights(text: string): AnalyticsInsights {
  return {
    weeklyFinance: text,
    menuOptimization: text,
    cartAbandonment: text,
    nextWeekActions: text,
    marginGrowth: text,
    behavioralInsights: text,
    operationalRisk: text,
    menuEngineering: text,
    wastePrevention: text,
    marginUpsell: text,
  };
}
