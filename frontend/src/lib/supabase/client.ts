"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      // Do not block on the global navigator Web Lock. The default lock can
      // deadlock signInWithPassword if a prior tab/session left the lock held
      // (e.g. after a crashed dev reload), producing an infinite sign-in spinner.
      // This ops app is effectively single-session per browser, so a pass-through
      // lock is a safe tradeoff and permanently removes the hang.
      lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> =>
        fn(),
    },
  });
}

let browserClient: ReturnType<typeof createClient> | null = null;

export function getBrowserClient() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}
