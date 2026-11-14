import { handleAiWaiterPost } from "@/lib/ai-waiter-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleAiWaiterPost(request);
}
