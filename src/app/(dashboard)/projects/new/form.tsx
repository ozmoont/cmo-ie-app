"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { AVAILABLE_COUNTRIES, AVAILABLE_MODELS } from "@/lib/types";
import type { AIModel } from "@/lib/types";
import { ArrowLeft, Globe, Bot, Building2 } from "lucide-react";
import Link from "next/link";

export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>(["IE"]);
  const [selectedModels, setSelectedModels] = useState<AIModel[]>([
    "chatgpt",
    "perplexity",
    "google_aio",
  ]);

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleModel = (model: AIModel) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: brandName,
          brand_name: brandName,
          website_url: websiteUrl || null,
          country_codes: selectedCountries,
          models: selectedModels,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}/prompts`);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create project");
        setLoading(false);
      }
    } catch {
      alert("Failed to create project");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-0">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to projects
      </Link>

      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-bold text-text-primary">
          New Project
        </h2>
        <p className="text-sm text-text-secondary mt-1">
          Set up a brand to track across AI search engines.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Brand Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/10">
                <Building2 className="h-5 w-5 text-text-secondary" />
              </div>
              <div>
                <CardTitle className="text-base">Brand Details</CardTitle>
                <CardDescription>
                  The brand you want to track in AI responses.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brandName">Brand name</Label>
              <Input
                id="brandName"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="Acme Legal"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (
                    val &&
                    !val.startsWith("http://") &&
                    !val.startsWith("https://")
                  ) {
                    setWebsiteUrl("https://" + val);
                  }
                }}
                placeholder="acmelegal.ie"
              />
              <p className="text-xs text-text-muted">
                We&apos;ll add https:// automatically if you don&apos;t include
                it
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Markets */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/10">
                <Globe className="h-5 w-5 text-text-secondary" />
              </div>
              <div>
                <CardTitle className="text-base">Target Markets</CardTitle>
                <CardDescription>
                  Where your customers are searching.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_COUNTRIES.map((country) => {
                const selected = selectedCountries.includes(country.code);
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => toggleCountry(country.code)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer active:scale-[0.97] ${
                      selected
                        ? "border-emerald bg-emerald/10 text-text-primary"
                        : "border-border bg-surface-hover text-text-secondary hover:text-text-primary hover:border-border"
                    }`}
                  >
                    {country.name}
                    {selected && (
                      <span className="text-text-primary">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* AI Models */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/10">
                <Bot className="h-5 w-5 text-text-secondary" />
              </div>
              <div>
                <CardTitle className="text-base">AI Models</CardTitle>
                <CardDescription>
                  Which AI engines to monitor for brand mentions.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_MODELS.map((model) => {
                const selected = selectedModels.includes(model.value);
                return (
                  <button
                    key={model.value}
                    type="button"
                    onClick={() => toggleModel(model.value)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer active:scale-[0.97] ${
                      selected
                        ? "border-emerald bg-emerald/10 text-text-primary"
                        : "border-border bg-surface-hover text-text-secondary hover:text-text-primary hover:border-border"
                    }`}
                  >
                    {model.label}
                    {selected && (
                      <span className="text-text-primary">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-text-secondary">
              Your plan allows up to {3} models.{" "}
              <span className="text-text-primary">
                {selectedModels.length}/3 selected.
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <Link href="/dashboard">
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            size="lg"
            disabled={!brandName || selectedModels.length === 0 || loading}
          >
            {loading ? "Creating..." : "Create Project & Add Prompts →"}
          </Button>
        </div>
      </form>
    </div>
  );
}
