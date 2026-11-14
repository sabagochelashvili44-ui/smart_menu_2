export const MAX_AI_PROMPTS_PER_RESTAURANT = 20;
export const AI_PROMPT_LABEL_MAX = 80;
export const AI_PROMPT_QUERY_MAX = 500;
export const AI_PROMPT_ICON_MAX = 16;

export type RestaurantAiPrompt = {
  id: string;
  restaurantId: string;
  label: string;
  queryText: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
};

export const DEFAULT_AI_PROMPTS: Omit<
  RestaurantAiPrompt,
  "id" | "restaurantId"
>[] = [
  {
    icon: "🍷",
    label: "რა ღვინო შევუხამო კერძებს?",
    queryText:
      "რა ღვინო ან სასმელი შევუხამო ამ მენიუს ძირითად კერძებს? მხოლოდ ის, რაც ამ მენიუშია.",
    isActive: true,
    sortOrder: 0,
  },
  {
    icon: "🌱",
    label: "მირჩიე სამარხვო/ვეგეტარიანული",
    queryText:
      "მირჩიე სამარხვო ან ვეგეტარიანული კერძები, რომლებიც ახლა მენიუშია.",
    isActive: true,
    sortOrder: 1,
  },
  {
    icon: "🌶️",
    label: "რა არის ყველაზე პოპულარული?",
    queryText: "რა არის დღეს ყველაზე პოპულარული კერძები მენიუში?",
    isActive: true,
    sortOrder: 2,
  },
  {
    icon: "⚡",
    label: "სწრაფი ლანჩი",
    queryText:
      "მირჩიეთ სწრაფი ლანჩი — კერძი, რომელიც სწრაფად მზადდება და ნოყიერია.",
    isActive: true,
    sortOrder: 3,
  },
  {
    icon: "🔥",
    label: "ტოპ 3 ბესტსელერი",
    queryText: "რომელია დღეს თქვენი მენიუს ტოპ 3 ყველაზე პოპულარული კერძი?",
    isActive: true,
    sortOrder: 4,
  },
  {
    icon: "🍰",
    label: "საფირმო დესერტი",
    queryText: "მირჩიეთ საფირმო დესერტი ამ მენიუდან.",
    isActive: true,
    sortOrder: 5,
  },
  {
    icon: "👶",
    label: "საბავშვო მენიუ",
    queryText:
      "რომელი კერძი გამოდგება ბავშვისთვის ამ მენიუდან — მსუბუქი და არაცხარე?",
    isActive: true,
    sortOrder: 6,
  },
  {
    icon: "🍽️",
    label: "სხვა",
    queryText:
      "კიდევ რა განსხვავებულ კერძებს მირჩევდით ჩვენი მენიუს სხვა კატეგორიებიდან (მაგალითად, სალათები, ზღვის პროდუქტები, წვნიანები ან დესერტი)?",
    isActive: true,
    sortOrder: 7,
  },
];

export function promptChipLabel(prompt: Pick<RestaurantAiPrompt, "icon" | "label">) {
  const icon = prompt.icon.trim();
  const label = prompt.label.trim();
  if (icon && label && !label.startsWith(icon)) return `${icon} ${label}`;
  return label || icon;
}

export function normalizePromptInput(input: {
  label?: string;
  queryText?: string;
  icon?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  const label = (input.label ?? "").trim().slice(0, AI_PROMPT_LABEL_MAX);
  const queryText = (input.queryText ?? "").trim().slice(0, AI_PROMPT_QUERY_MAX);
  const icon = (input.icon ?? "").trim().slice(0, AI_PROMPT_ICON_MAX);
  return {
    label,
    queryText,
    icon,
    isActive: input.isActive !== false,
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
  };
}
