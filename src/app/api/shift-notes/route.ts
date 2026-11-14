import { toShiftNote } from "@/lib/shift-notes";
import {
  insertShiftNote,
  selectShiftNotes,
} from "@/lib/shift-notes-query";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireTenantApi } from "@/lib/tenant";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await selectShiftNotes(
    supabase,
    tenant.restaurant.id,
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    notes: (data ?? []).map((row) => toShiftNote(row as Record<string, unknown>)),
  });
}

export async function POST(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;

  try {
    const body = (await request.json()) as {
      title?: string;
      body?: string;
      content?: string;
    };
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? body.body ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Note content is required." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const authorEmail = String(tenant.user.email ?? "").trim().toLowerCase();
    const { data, error } = await insertShiftNote(supabase, {
      restaurant_id: tenant.restaurant.id,
      title: title || content.slice(0, 80),
      content,
      body: content,
      author_email: authorEmail || undefined,
      author_role: tenant.staffRole || undefined,
    });

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Could not save the note." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      note: toShiftNote(data as Record<string, unknown>),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not save the note.",
      },
      { status: 500 },
    );
  }
}
