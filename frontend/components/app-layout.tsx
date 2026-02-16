'use client';

import { Sidebar } from "@/components/sidebar";
import { useAuth } from "@/components/auth-provider";
import { VoiceAssistant } from "@/components/VoiceAssistant";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();

  // Only show sidebar layout for authenticated users
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {/* Global Voice Assistant - persists across all pages */}
      <VoiceAssistant />
    </div>
  );
}
