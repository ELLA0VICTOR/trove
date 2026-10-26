import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowRight, ChevronDown, CircleHelp } from "lucide-react";
import { Brand } from "./Brand.tsx";
import { ThemeToggle } from "./UI.tsx";
import { useApp } from "../lib/app-context.tsx";

export function AppLayout() {
  const { state, error, refresh, toast } = useApp(),
    location = useLocation();
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="consumer-app">
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <Brand compact />
        <nav aria-label="Your Trove">
          <NavLink end to="/app">
            Your growth
          </NavLink>
          <NavLink to="/app/explore">Explore</NavLink>
          <NavLink to="/app/decisions">Your decisions</NavLink>
        </nav>
        <div className="app-header-actions">
          <ThemeToggle />
          <Link to="/app/parent" className="profile-link">
            <span className="avatar">
              {location.pathname.includes("parent") ? "E" : "M"}
            </span>
            <span>
              {location.pathname.includes("parent")
                ? "Parent view"
                : "Maya’s Trove"}
            </span>
            <ChevronDown size={13} />
          </Link>
        </div>
      </header>
      <div className="sample-strip">
        <span>
          <span className="live-dot" /> SAMPLE EXPERIENCE{" "}
          <span className="sample-separator">/</span> Practice funds · authored
          sample prices
        </span>
        <Link to="/app/evidence">
          About this build <ArrowRight size={13} />
        </Link>
      </div>
      <main id="app-main" className="app-main">
        {!state ? (
          <div className="loading-state">
            <Brand compact />
            <p>{error || "Getting your Trove ready…"}</p>
            {error && (
              <button className="button" onClick={() => void refresh()}>
                Try again
              </button>
            )}
          </div>
        ) : (
          <Outlet />
        )}
      </main>
      <footer className="app-footer">
        <span>
          <span className="accent">✳</span> Small decisions. Lasting growth.
        </span>
        <div>
          <Link to="/app/guide">
            <CircleHelp size={13} /> Your learning guide
          </Link>
          <Link to="/app/evidence">Local demo</Link>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
