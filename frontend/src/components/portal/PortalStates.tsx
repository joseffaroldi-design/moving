"use client";

import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";
import { BRAND } from "@/lib/brand";

// Friendly state shown when an authenticated user reaches the portal but is not
// a linked customer (e.g. a staff account). The portal RPCs raise
// "Not authorized as a customer" in this case.
export function PortalNotCustomer() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="This portal is for customers"
      description={`Your account isn't linked to a customer profile yet. If you're a ${BRAND.short} customer, please contact us at ${BRAND.phone} and we'll get you set up.`}
      data-testid="portal-not-customer"
    />
  );
}
