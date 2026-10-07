import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRO_PLAN_AMOUNT_PAISE = 2900; // ₹29 in paise
const CURRENCY = "INR";

/**
 * Creates an order on Razorpay servers.
 * Requires RAZORPAY_KEY_SECRET and VITE_RAZORPAY_KEY_ID or RAZORPAY_KEY_ID in environment.
 */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.literal("pro_monthly").default("pro_monthly") }).parse(input))
  .handler(async ({ context }) => {
    const keyId = process.env["VITE_RAZORPAY_KEY_ID"] || process.env["RAZORPAY_KEY_ID"];
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];

    if (!keyId || !keySecret) {
      return { ok: false as const, error: "Razorpay payment keys are not configured yet." };
    }

    const auth = btoa(`${keyId}:${keySecret}`);
    const receipt = `rcpt_${Date.now().toString(36)}`;

    try {
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: PRO_PLAN_AMOUNT_PAISE,
          currency: CURRENCY,
          receipt,
          notes: {
            plan: "LabBench Pro Monthly (₹29)",
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Razorpay order creation failed:", errText);
        return { ok: false as const, error: `Failed to create payment order (${res.status}).` };
      }

      const order = await res.json();
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: saveError } = await (supabaseAdmin as any).from("razorpay_orders").insert({
        order_id: order.id as string,
        user_id: context.userId,
        amount: order.amount as number,
        currency: order.currency as string,
      });
      if (saveError) {
        console.error("Could not save Razorpay order:", saveError.message);
        return { ok: false as const, error: "Could not prepare your account for payment." };
      }
      return {
        ok: true as const,
        orderId: order.id as string,
        amount: order.amount as number,
        currency: order.currency as string,
        keyId,
      };
    } catch (e) {
      console.error("Razorpay order exception:", e);
      return { ok: false as const, error: "Network error connecting to payment gateway." };
    }
  });

/**
 * Validates Razorpay payment signature using HMAC SHA-256 (Web Crypto).
 */
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      orderId: z.string().min(5),
      paymentId: z.string().min(5),
      signature: z.string().min(10),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const keySecret = process.env["RAZORPAY_KEY_SECRET"];
    if (!keySecret) return { ok: false as const, error: "Payment verification key missing." };

    try {
      const text = `${data.orderId}|${data.paymentId}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(keySecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(text));
      const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (expectedSignature !== data.signature.toLowerCase()) {
        return { ok: false as const, error: "Invalid payment signature." };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: order, error: orderError } = await (supabaseAdmin as any)
        .from("razorpay_orders").select("order_id,user_id,amount,currency,paid_at")
        .eq("order_id", data.orderId).maybeSingle();
      if (orderError || !order || order.user_id !== context.userId) {
        return { ok: false as const, error: "This payment order does not belong to your account." };
      }
      if (order.paid_at) return { ok: true as const, verified: true };

      // Confirm the payment with Razorpay itself and ensure it was captured for this order.
      const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(data.paymentId)}`, {
        headers: { Authorization: `Basic ${btoa(`${process.env["RAZORPAY_KEY_ID"] || process.env["VITE_RAZORPAY_KEY_ID"]}:${keySecret}`)}` },
      });
      if (!paymentResponse.ok) return { ok: false as const, error: "Could not confirm payment with Razorpay." };
      const payment = await paymentResponse.json();
      if (payment.order_id !== data.orderId || payment.status !== "captured" || payment.amount !== order.amount || payment.currency !== order.currency) {
        return { ok: false as const, error: "Payment is not captured for this Pro order." };
      }

      const { error: grantError } = await supabaseAdmin.rpc("grant_pro_from_payment", {
        p_order_id: data.orderId,
        p_payment_id: data.paymentId,
        p_user_id: context.userId,
      });
      if (grantError) {
        console.error("Pro entitlement grant failed:", grantError.message);
        return { ok: false as const, error: "Payment received but Pro activation failed. Please contact support." };
      }

      return { ok: true as const, verified: true };
    } catch (e) {
      console.error("Signature verification error:", e);
      return { ok: false as const, error: "Could not verify payment signature." };
    }
  });

export const getProStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("pro_entitlements")
      .select("expires_at").eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error("Could not load Pro status.");
    return { isPro: Boolean(data && new Date(data.expires_at).getTime() > Date.now()), expiresAt: data?.expires_at ?? null };
  });
