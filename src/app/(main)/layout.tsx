import Navbar from "@/components/Navbar";
import { SideMenu } from "@/components/SideMenu";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
    <>
      <Navbar />
      <SideMenu userEmail={user?.email ?? null} />
      {children}
    </>
  );
}
