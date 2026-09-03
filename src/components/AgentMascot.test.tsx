import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AGENT_PROFILES } from "@/lib/agents/profiles";
import { AgentMascot } from "./AgentMascot";

describe("AgentMascot", () => {
  it.each(Object.keys(AGENT_PROFILES) as Array<keyof typeof AGENT_PROFILES>)(
    "renders the persistent identity for %s",
    (role) => {
      const profile = AGENT_PROFILES[role];
      render(<AgentMascot role={role} showLabel />);

      expect(screen.getByText(profile.name)).toBeInTheDocument();
      expect(screen.getByText(profile.title)).toBeInTheDocument();
      // Idle state maps to "standby" in the accessible label
      expect(
        screen.getByLabelText(`${profile.name}, ${profile.title}, standby`),
      ).toBeInTheDocument();
    },
  );

  it("exposes the requested animation state in the accessible label and title", () => {
    render(<AgentMascot role="market_research" state="thinking" />);

    const mascot = screen.getByLabelText("Vector, Market Structure, thinking");
    expect(mascot).toHaveAttribute(
      "title",
      "Vector · Market Structure · thinking",
    );
  });

  it("renders a compact mascot without requiring a label", () => {
    render(<AgentMascot role="investment_committee" size="sm" />);

    expect(
      screen.queryByText(AGENT_PROFILES.investment_committee.name),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("North, Chief Investment Officer, standby"),
    ).toBeInTheDocument();
  });
});
