"use client";

import { useState } from "react";
import { Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function MobileClockPage() {
  const toast = useToast();
  const [clockedIn, setClockedIn] = useState(false);
  const [since, setSince] = useState<string | null>(null);

  function clockIn() {
    setClockedIn(true);
    setSince(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    toast("Clocked in.", "success");
  }
  function clockOut() {
    setClockedIn(false);
    setSince(null);
    toast("Clocked out.", "success");
  }

  return (
    <div>
      <h1 className="mb-4 font-heading text-xl font-bold text-navy">Time Clock</h1>

      <div className="rounded-md border border-slate-200 bg-white p-6 text-center shadow-card">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${clockedIn ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Clock className={`h-8 w-8 ${clockedIn ? "text-emerald-600" : "text-slate-400"}`} />
        </div>
        <p className="mt-3 font-heading text-lg font-bold text-navy">
          {clockedIn ? "On the clock" : "Not clocked in"}
        </p>
        {since && <p className="text-sm text-slate-500">Since {since}</p>}
      </div>

      <div className="mt-4">
        {clockedIn ? (
          <Button variant="danger" size="lg" className="w-full py-4 text-base" onClick={clockOut} data-testid="clock-out-button">
            <LogOut className="h-5 w-5" /> Clock Out
          </Button>
        ) : (
          <Button variant="navy" size="lg" className="w-full py-4 text-base" onClick={clockIn} data-testid="clock-in-button">
            <LogIn className="h-5 w-5" /> Clock In
          </Button>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">
        Time entries sync to crew-clock-in / crew-clock-out once signed in.
      </p>
    </div>
  );
}
