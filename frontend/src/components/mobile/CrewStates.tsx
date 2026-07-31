"use client";

import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

// Shown when an authenticated user opens the crew app but is not an active
// crew member (crew read RPCs raise "Not authorized as crew").
export function CrewNotAuthorized() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Crew access only"
      description="This app is for assigned moving crew. If you should have access, ask your dispatcher to add you to a job."
      data-testid="crew-not-authorized"
    />
  );
}
