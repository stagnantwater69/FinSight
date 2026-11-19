// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SlidingIndicator } from "./SlidingIndicator";

// jsdom does no layout: give each option a fixed box from its data attributes.
const props = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"] as const;
const saved = props.map((name) => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const);

beforeEach(() => {
  for (const name of props) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        const index = Number(this.dataset.index ?? 0);
        return { offsetLeft: index * 100, offsetTop: 4, offsetWidth: 90, offsetHeight: 40 }[name];
      },
    });
  }
});

afterEach(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
  }
});

function Tabs() {
  const [active, setActive] = useState(0);
  return (
    <div role="tablist">
      <SlidingIndicator activeKey={active} className="bg-paper" />
      {["One", "Two"].map((label, index) => (
        <button key={label} role="tab" data-index={index} aria-selected={active === index} onClick={() => setActive(index)}>
          {label}
        </button>
      ))}
    </div>
  );
}

describe("SlidingIndicator", () => {
  it("sits behind the selected option and follows a new selection", () => {
    render(<Tabs />);
    const indicator = screen.getByTestId("sliding-indicator");
    expect(indicator.style.transform).toBe("translate(0px, 4px)");
    expect(indicator.style.width).toBe("90px");

    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByTestId("sliding-indicator").style.transform).toBe("translate(100px, 4px)");
  });

  it("renders nothing when no option is selected", () => {
    function Empty() {
      return (
        <div>
          <SlidingIndicator activeKey={null} className="" />
          <button aria-pressed={false}>Off</button>
        </div>
      );
    }
    render(<Empty />);
    expect(screen.getByTestId("sliding-indicator").className).toContain("hidden");
  });
});
