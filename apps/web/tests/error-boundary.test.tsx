import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "~/components/error-boundary";

/**
 * Whatever this component renders replaces the entire server-rendered page, so
 * a crawler that renders one of these reads its text as the page. Google did,
 * and "Failed to fetch dynamically imported module:
 * https://fileconcat.com/assets/index-….js" became the description under
 * fileconcat.com in the results. The message has to stay out of the DOM.
 */
describe("the root error screen", () => {
  it("keeps the error message out of the document", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(
      "Failed to fetch dynamically imported module: https://fileconcat.com/assets/index-g_u974-X.js",
    );

    render(<ErrorBoundary error={error} />);

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("dynamically imported module");
    expect(text).not.toContain("/assets/");
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("always offers a way out, with or without a route reset", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = render(<ErrorBoundary error={new Error("boom")} />);
    // getByRole throws when it is missing; jest-dom is deliberately not used
    // here so the test does not depend on which vitest the workspace hoists.
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    unmount();

    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(reset).toHaveBeenCalled();
  });
});
