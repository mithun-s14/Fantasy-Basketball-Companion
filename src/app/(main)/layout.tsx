import { AppShell } from "@/components/AppShell";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getWeekRange } from "@/lib/utils";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppShell userEmail={user?.email ?? null} weekLabel={getWeekRange().label}>
      {children}
    </AppShell>
  );
}
