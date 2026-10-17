import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { CATEGORIES } from "@/lib/league";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string }> };

/** Change the draft's punts mid-draft. Body: { punts: string[] }. RLS scopes to the owner. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const punts: unknown = body?.punts;
  if (!Array.isArray(punts) || punts.some((c) => !CATEGORIES.includes(c))) {
    return NextResponse.json({ error: "Punts must be category names." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("drafts")
    .update({ punts, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update the draft." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Abandon a draft, picks and all, so the league can start a new one. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data, error } = await supabase.from("drafts").delete().eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not delete the draft." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
