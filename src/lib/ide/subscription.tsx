import { useState } from "react";
import { Check, Sparkles, X, ShieldCheck, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/ide/razorpay.functions";

export interface SubscriptionData {
  email?: string;
  purchasedAt?: string;
  token?: string;
  [key: string]: any;
}

interface ProModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userEmail?: string | null;
}

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function ProModal({ open, onClose, onSuccess, userEmail }: ProModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);

  if (!open) return null;

  const handleSubscribe = async () => {
    if (!userEmail) {
      setError("Please sign in with Google before purchasing LabBench Pro.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError("Unable to load payment gateway. Please check your internet connection.");
      setLoading(false);
      return;
    }

    try {
      const orderRes = await createOrder({ data: { planId: "pro_monthly" } });
      if (!orderRes.ok) {
        setError(orderRes.error || "Could not start payment.");
        setLoading(false);
        return;
      }

      const options = {
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        name: "LabBench",
        description: "LabBench Pro — 1 Month Unlimited AI TA",
        order_id: orderRes.orderId,
        prefill: {
          email: userEmail || "",
        },
        theme: {
          color: "#059669",
        },
        modal: {
          ondismiss: () => setLoading(false),
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verRes = await verifyPayment({
              data: {
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              },
            });

            if (verRes.ok && verRes.verified) {
              onSuccess();
              onClose();
            } else {
              setError("Payment verification failed. Please contact support if debited.");
            }
          } catch (err) {
            setError("Could not complete verification. Please refresh.");
          } finally {
            setLoading(false);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => {
        setError(resp.error?.description || "Payment failed. Please try again.");
        setLoading(false);
      });
      rzp.open();
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">LabBench Pro Pass</h2>
            <p className="text-xs text-muted-foreground">
              Unlimited AI assistance for lab students
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Pro Monthly</span>
            <div className="text-right">
              <span className="text-2xl font-black text-foreground">₹29</span>
              <span className="text-xs text-muted-foreground"> / month</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Less than a cup of chai. Cancel anytime.
          </p>
        </div>

        <ul className="mt-4 space-y-2.5 text-xs text-foreground/90">
          <li className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500 shrink-0" />
            <span>
              <strong>Unlimited AI TA hints</strong> (no 5-hint per-day limit)
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500 shrink-0" />
            <span>
              <strong>Only for signed-in Google users</strong> for secure, email-based access
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500 shrink-0" />
            <span>
              <strong>Valid until the end of the month</strong> from the purchase date
            </span>
          </li>
          <li className="flex items-center gap-2">
            <Check size={14} className="text-emerald-500 shrink-0" />
            <span>
              <strong>Guest users stay on</strong> the daily 5/5 free plan
            </span>
          </li>
        </ul>

        {error && (
          <div className="mt-4 rounded-lg bg-destructive/15 p-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        <button
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Unlock Pro for ₹29"}
        </button>

        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck size={13} className="text-emerald-500" />
          <span>Secured with Razorpay (UPI, Google Pay, Cards, NetBanking)</span>
        </div>
      </div>
    </div>
  );
}

export function isSubscriptionActive(subOrEmail?: SubscriptionData | string | null): boolean {
  if (!subOrEmail) return false;

  if (typeof subOrEmail === "string") {
    const sub = loadSubscriptionForEmail(subOrEmail);
    return isSubscriptionActive(sub);
  }

  if (typeof window === "undefined") return false;

  const token = localStorage.getItem("labbench_pro_token");
  if (!token && !subOrEmail.token && !subOrEmail.email && !subOrEmail.purchasedAt) {
    return false;
  }

  if (subOrEmail.purchasedAt) {
    const purchaseDate = new Date(subOrEmail.purchasedAt);
    const now = new Date();
    if (
      purchaseDate.getFullYear() === now.getFullYear() &&
      purchaseDate.getMonth() === now.getMonth()
    ) {
      return true;
    }
  }

  return true;
}

export function loadSubscriptionForEmail(email: string | null | undefined): SubscriptionData | null {
  if (typeof window === "undefined" || !email) return null;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const rawSub =
      localStorage.getItem(`labbench.pro.${normalizedEmail}`) ||
      localStorage.getItem("labbench_subscription");
    
    if (rawSub) {
      return JSON.parse(rawSub);
    }

    const token = localStorage.getItem("labbench_pro_token");
    if (token) {
      return { email: normalizedEmail, token };
    }
  } catch (e) {
    console.error("Failed to load subscription data", e);
  }

  return null;
}

export function saveSubscriptionForEmail(email: string | null | undefined, data: any) {
  if (typeof window === "undefined") return;

  const payload = typeof data === "object" ? data : { data };
  const rawData = JSON.stringify(payload);

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    localStorage.setItem(`labbench.pro.${normalizedEmail}`, rawData);
  }

  localStorage.setItem("labbench_subscription", rawData);
  if (payload.token) {
    localStorage.setItem("labbench_pro_token", payload.token);
  }
}
