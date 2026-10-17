import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { Category } from "@/lib/league";

/**
 * Start a draft from the user's saved league profile (DB-1), or return the
 * profile's active draft so a second start resumes it. Body: { punts?: string[] }.
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to start a draft." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const punts: unknown = body?.punts ?? [];

  const { data: profile, error: profileError } = await supabase
    .from("league_profiles")
    .select("id, categories, draft_slot")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Could not load your league." }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Save your league settings first." }, { status: 400 });

  if (!Array.isArray(punts) || punts.some((c) => !(profile.categories as Category[]).includes(c))) {
    return NextResponse.json({ error: "Punts must be categories in your league." }, { status: 400 });
  }

  const findActive = () =>
    supabase.from("drafts").select("id").eq("league_profile_id", profile.id).eq("status", "active").maybeSingle();

  const { data: active } = await findActive();
  if (active) return NextResponse.json({ id: active.id, resumed: true });

  const { data: created, error } = await supabase
    .from("drafts")
    .insert({ user_id: user.id, league_profile_id: profile.id, draft_slot: profile.draft_slot, punts })
    .select("id")
    .single();
  if (error) {
    // Lost a race with another start: the unique index allows one active draft.
    if (error.code === "23505") {
      const { data: raced } = await findActive();
      if (raced) return NextResponse.json({ id: raced.id, resumed: true });
    }
    return NextResponse.json({ error: "Could not start the draft." }, { status: 500 });
  }
  return NextResponse.json({ id: created.id, resumed: false }, { status: 201 });
}
