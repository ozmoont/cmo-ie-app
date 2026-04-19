import { ImageResponse } from "next/og";

/**
 * Default Open Graph image for the site.
 * Next.js picks this up as `/opengraph-image` and auto-wires it into
 * the og:image tag for every page that doesn't override it. Edge runtime
 * keeps the response fast.
 *
 * Design: paper-warm background, near-black type, one forest-green
 * kicker rule. Mirrors the editorial system used in the product.
 */
export const runtime = "edge";
export const alt = "CMO.ie - AI Search Visibility for Irish Brands";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#FAFAF8",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          fontFamily: "Geist, system-ui, sans-serif",
          color: "#141614",
        }}
      >
        {/* Top row: kicker + mark */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "32px",
              height: "3px",
              backgroundColor: "#166534",
            }}
          />
          <div
            style={{
              fontSize: "18px",
              fontWeight: 600,
              letterSpacing: "4px",
              textTransform: "uppercase",
              color: "#14532D",
            }}
          >
            CMO.ie
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxWidth: "950px",
          }}
        >
          <div
            style={{
              fontSize: "84px",
              fontWeight: 600,
              letterSpacing: "-2px",
              lineHeight: 1.05,
              color: "#141614",
            }}
          >
            Know exactly how AI talks about your brand.
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 400,
              color: "#5C5F58",
              lineHeight: 1.35,
              maxWidth: "800px",
            }}
          >
            Track ChatGPT, Perplexity, Gemini, and Google AI Overviews - daily.
          </div>
        </div>

        {/* Footer strip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #E4E4DE",
            paddingTop: "24px",
            fontSize: "18px",
            color: "#5C5F58",
          }}
        >
          <div>AI Search Visibility for Irish Brands</div>
          <div style={{ color: "#14532D", fontWeight: 600 }}>cmo.ie</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
