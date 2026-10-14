import { getBrowserClient } from "@/lib/supabase/client";

export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

export type PaymentKind = "deposit" | "invoice";

export interface PortalDepositState {
  required: boolean;
  amount: number;
  paid_at: string | null;
  paid: boolean;
}

export async function getPortalDepositState(quoteId: string): Promise<PortalDepositState> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.rpc("portal_get_deposit_state", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);
  return data as PortalDepositState;
}

export async function startPortalPaymentCheckout(kind: PaymentKind, targetId: string): Promise<never> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.functions.invoke("create-payment-checkout", {
    body: { kind, target_id: targetId },
  });

  if (error) throw new Error(error.message || "Unable to start payment checkout");
  const url = data && typeof data.url === "string" ? data.url : "";
  if (!url || !url.startsWith("https://")) throw new Error("Payment checkout did not return a valid URL");

  window.location.assign(url);
  return new Promise<never>(() => undefined);
}
