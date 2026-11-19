// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Contact } from "./Contact";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_AVAILABLE } from "../lib/marketingContent";

describe("Contact page support address", () => {
  it("never offers a placeholder address that cannot receive mail", () => {
    const { container } = render(
      <MemoryRouter>
        <Contact />
      </MemoryRouter>,
    );
    const mailLinks = container.querySelectorAll('a[href^="mailto:"]');
    if (SUPPORT_EMAIL_AVAILABLE) {
      expect(mailLinks).toHaveLength(1);
      expect(mailLinks[0].getAttribute("href")).toBe(`mailto:${SUPPORT_EMAIL}`);
    } else {
      expect(mailLinks).toHaveLength(0);
      expect(screen.getByText(/Email support is not available yet/)).toBeTruthy();
    }
  });
});
