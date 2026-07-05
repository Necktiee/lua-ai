"use client";

import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";

type Status = "loading" | "logging-in" | "verifying" | "ready" | "error";

interface Profile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export default function LiffPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>("");
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        setError("ยังไม่ตั้งค่า LIFF ID (NEXT_PUBLIC_LIFF_ID)");
        setStatus("error");
        return;
      }

      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });

        if (cancelled) return;

        if (!liff.isLoggedIn()) {
          setStatus("logging-in");
          liff.login();
          return; // liff.login() redirects — execution stops here
        }

        setStatus("verifying");
        const idToken = liff.getIDToken();
        if (!idToken) {
          setError("ไม่พบ ID token จาก LIFF");
          setStatus("error");
          return;
        }

        const res = await fetch("/api/liff/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || data.error) {
          setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
          setStatus("error");
          return;
        }

        const p = liff.getDecodedIDToken();
        setProfile({
          userId: data.userId,
          displayName: (p?.name as string) || "ผู้ใช้",
          pictureUrl: p?.picture as string | undefined,
        });
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        console.error("[liff] init/login failed", e);
        setError((e as Error).message || "เกิดข้อผิดพลาด");
        setStatus("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "ready" && profile) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-black font-sans">
        <Dashboard profile={profile} />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black p-6 font-sans">
      <div className="max-w-sm w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-8 space-y-4 text-center">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">โฮชิ Dashboard</h1>

        {status === "loading" && <p className="text-zinc-500 text-sm">กำลังโหลด...</p>}
        {status === "logging-in" && (
          <p className="text-zinc-500 text-sm">กำลังพาไปเข้าสู่ระบบ LINE...</p>
        )}
        {status === "verifying" && (
          <p className="text-zinc-500 text-sm">กำลังยืนยันตัวตน...</p>
        )}
        {status === "error" && (
          <div className="space-y-2">
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              ลองใหม่
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
