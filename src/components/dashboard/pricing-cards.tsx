"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Plan {
  name: string;
  priceId: string;
  monthlyPrice: number;
  features: string[];
}

const PLANS: Record<string, Plan> = {
  starter: {
    name: "Starter",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || "",
    monthlyPrice: 49,
    features: [
      "1 project",
      "50 prompts per month",
      "3 AI models",
      "Basic analytics",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "",
    monthlyPrice: 149,
    features: [
      "3 projects",
      "150 prompts per month",
      "5 AI models",
      "Advanced analytics",
      "Priority email support",
    ],
  },
  advanced: {
    name: "Advanced",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ADVANCED || "",
    monthlyPrice: 349,
    features: [
      "Unlimited projects",
      "Unlimited prompts",
      "All AI models",
      "Real-time analytics",
      "24/7 priority support",
      "Custom integrations",
    ],
  },
};

const planOrder = ["starter", "pro", "advanced"] as const;

interface PricingCardsProps {
  currentPlan: string;
}

export function PricingCards({ currentPlan }: PricingCardsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleCheckout = async (planKey: string) => {
    const plan = PLANS[planKey];
    if (!plan.priceId) {
      console.error("Price ID not configured");
      return;
    }

    setIsLoading(planKey);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: plan.priceId }),
      });

      if (!response.ok) {
        throw new Error("Checkout failed");
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setIsLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setIsLoading("manage");
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Portal failed");
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error("Portal error:", error);
      setIsLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
      {planOrder.map((planKey) => {
        const plan = PLANS[planKey];
        const isCurrentPlan = currentPlan === planKey;

        return (
          <Card
            key={planKey}
            className={`flex flex-col relative overflow-hidden transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isCurrentPlan
                ? "border-emerald ring-2 ring-emerald/30 ring-inset"
                : "hover:border-border hover:-translate-y-1"
            }`}
          >
            {isCurrentPlan && (
              <div className="absolute top-0 right-0 px-4 py-2">
                <Badge variant="default">Current Plan</Badge>
              </div>
            )}

            <CardHeader>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription className="mt-4">
                <span className="text-3xl font-bold text-text-primary">
                  EUR {plan.monthlyPrice}
                </span>
                <span className="text-text-secondary ml-2">/month</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col flex-grow">
              <ul className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-text-secondary">
                    <span className="text-text-primary font-bold mt-0.5">+</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? (
                // `isCurrentPlan` already narrows `currentPlan` to a paid plan
                // (planOrder never contains "trial"), so always surface Manage.
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" disabled>
                    Current Plan
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleManageSubscription}
                    disabled={isLoading === "manage"}
                    className="flex-1"
                  >
                    {isLoading === "manage" ? "Loading..." : "Manage"}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => handleCheckout(planKey)}
                  disabled={isLoading === planKey}
                  className="w-full"
                >
                  {isLoading === planKey ? "Loading..." : "Upgrade"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
