"use client";

import { useEffect, useState } from "react";
import { Robot, WarningCircle, ArrowClockwise } from "@phosphor-icons/react";
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
      <main className="min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 font-sans">
        <Dashboard profile={profile} />
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 font-sans">
      <div className="max-w-sm w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-8 space-y-5 text-center">
        <div className="flex items-center justify-center gap-2">
          <Robot weight="fill" className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">โฮชิ Dashboard</h1>
        </div>

        {status !== "error" && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <span className="relative flex h-8 w-8">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex rounded-full h-8 w-8 bg-emerald-500" />
              </span>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm">
              {status === "loading" && "กำลังโหลด..."}
              {status === "logging-in" && "กำลังพาไปเข้าสู่ระบบ LINE..."}
              {status === "verifying" && "กำลังยืนยันตัวตน..."}
            </p>
          </div>
        )}
        {status === "error" && (
          <div className="space-y-3">
            <WarningCircle weight="fill" className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              <ArrowClockwise weight="bold" className="w-4 h-4" />
              ลองใหม่
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
