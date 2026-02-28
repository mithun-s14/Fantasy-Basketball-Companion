import Link from "next/link";
import Image from "next/image";
import { AuthButton } from "@/components/AuthButton";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function Navbar() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email ?? null;

  return (
    <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-black/6 px-6 py-1">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left: Logo + Nav links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-1">
            <Image
              src="/fbclogo.png"
              alt="Fantasy Basketball Companion logo"
              width={50}
              height={50}
              className="object-contain mt-2"
            />
            <span className="font-semibold text-gray-900 tracking-tight">
              Fantasy Basketball Companion
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/analyzer"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
            >
              Schedule Analyzer
            </Link>
            <Link
              href="/chat"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
            >
              AI Coach
            </Link>
            {userEmail && (
              <Link
                href="/roster"
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
              >
                Roster
              </Link>
            )}
          </div>
        </div>

        {/* Right: Auth */}
        <AuthButton userEmail={userEmail} />
      </div>
    </nav>
  );
}
