import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "./Sidebar";

const routerReplace = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/home/research",
  useRouter: () => ({ replace: routerReplace, refresh: routerRefresh }),
}));

function renderSidebar() {
  render(
    <Sidebar collapsed={false} mobileOpen={false} onCloseMobile={vi.fn()} onToggleCollapsed={vi.fn()} />,
  );
}

describe("Sidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    routerReplace.mockClear();
    routerRefresh.mockClear();
  });

  it("renders the logout button", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("clears the session and redirects to /login on logout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(routerRefresh).toHaveBeenCalled();
  });
});