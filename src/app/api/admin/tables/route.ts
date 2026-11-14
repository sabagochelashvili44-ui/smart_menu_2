import { addAdminTable, deleteAdminTable, loadAdminTables } from "@/app/admin/actions";
import { requireTenantApi } from "@/lib/tenant";
import type { Table } from "@/types/database";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const tenant = await requireTenantApi();
  if (!tenant.ok) return tenant.response;

  const data = await loadAdminTables();
  if (!data.restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;

  const body = (await request.json().catch(() => null)) as Partial<Table> | null;
  if (!body?.table_number?.trim()) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  const result = await addAdminTable(body.table_number);
  if (result.error || !result.table) {
    return NextResponse.json(
      { error: result.error ?? "Could not add table" },
      { status: 400 },
    );
  }
  return NextResponse.json({ table: result.table });
}

export async function DELETE(request: Request) {
  const tenant = await requireTenantApi(["owner", "manager"]);
  if (!tenant.ok) return tenant.response;

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Invalid table" }, { status: 400 });
  }
  const result = await deleteAdminTable(id);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
