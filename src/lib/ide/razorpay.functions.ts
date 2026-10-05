import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PRO_PLAN_AMOUNT_PAISE = 2900; // ₹29 in paise
const CURRENCY = "INR";

/**
 * Creates an order on Razorpay servers.
 * Requires RAZORPAY_KEY_SECRET and VITE_RAZORPAY_KEY_ID or RAZORPAY_KEY_ID in environment.
 */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ planId: z.literal("pro_monthly").default("pro_monthly") }).parse(input))
  .handler(async () => {
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
  .inputValidator((input) =>
    z.object({
      orderId: z.string().min(5),
      paymentId: z.string().min(5),
      signature: z.string().min(10),
    }).parse(input)
  )
  .handler(async ({ data }) => {
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

      if (expectedSignature !== data.signature) {
        return { ok: false as const, error: "Invalid payment signature." };
      }

      return { ok: true as const, verified: true };
    } catch (e) {
      console.error("Signature verification error:", e);
      return { ok: false as const, error: "Could not verify payment signature." };
    }
  });
