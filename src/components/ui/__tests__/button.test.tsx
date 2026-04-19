import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../button";

describe("<Button />", () => {
  it("renders children as accessible text", () => {
    render(<Button>Continue</Button>);
    expect(
      screen.getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
  });

  it("applies the default (matte black) variant classes", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    // Primary CTA uses text-primary background per design spec.
    expect(btn.className).toContain("bg-text-primary");
  });

  it("honours the danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-danger");
  });

  it("respects the disabled attribute", () => {
    render(<Button disabled>Nope</Button>);
    const btn = screen.getByRole("button", { name: "Nope" });
    expect(btn).toBeDisabled();
  });

  it("forwards arbitrary props", () => {
    render(<Button data-testid="cta">Save</Button>);
    expect(screen.getByTestId("cta")).toHaveTextContent("Save");
  });
});
