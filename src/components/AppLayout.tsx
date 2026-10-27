import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  Home,
  ListOrdered,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sprout,
  X,
} from "lucide-react";
import { Brand } from "./Brand.tsx";
import { useApp } from "../lib/app-context.tsx";
import { AccountDialog } from "./AccountDialog.tsx";

export function AppLayout() {
  const { state, error, refresh, toast } = useApp(),
    location = useLocation(),
    [menuOpen, setMenuOpen] = useState(false),
    [accountOpen, setAccountOpen] = useState(false),
    [sidebarHidden, setSidebarHidden] = useState(() => {
      try {
        return localStorage.getItem("trove-sidebar-hidden") === "1";
      } catch {
        return false;
      }
    });
  const navigation = [
    { to: "/app", label: "Home", icon: Home, end: true },
    { to: "/app/guide", label: "Learn", icon: BookOpen },
    { to: "/app/explore", label: "Explore", icon: Compass },
    { to: "/app/decisions", label: "Decisions", icon: ListOrdered },
    { to: "/app/parent", label: "Parent", icon: ShieldCheck },
  ];
  const section = location.pathname.includes("parent")
    ? "Parent controls"
    : location.pathname.includes("replay")
      ? "Decision replay"
      : location.pathname.includes("evidence")
        ? "About this build"
        : (navigation.find((item) =>
            item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to),
          )?.label ?? "Home");
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!state?.market?.blocked && !state?.chain?.pending?.length) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [state?.market?.blocked, state?.chain?.pending?.length, refresh]);
  useEffect(() => {
    const resumed = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("focus", resumed);
    document.addEventListener("visibilitychange", resumed);
    return () => {
      window.removeEventListener("focus", resumed);
      document.removeEventListener("visibilitychange", resumed);
    };
  }, [refresh]);
  useEffect(() => {
    try {
      localStorage.setItem("trove-sidebar-hidden", sidebarHidden ? "1" : "0");
    } catch {
      /* View preference is optional. */
    }
  }, [sidebarHidden]);
  useEffect(() => {
    window.scrollTo(0, 0);
    // oxlint-disable-next-line react/set-state-in-effect -- A route transition dismisses the external navigation overlay.
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = document.getElementById("app-navigation");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar?.querySelector<HTMLButtonElement>("button")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
      if (event.key === "Tab") {
        const targets = [
          ...(sidebar?.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled])",
          ) ?? []),
        ];
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const resize = () => {
      if (innerWidth > 760) setMenuOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", resize);
      document.body.style.overflow = previousOverflow;
      document
        .getElementById("app-menu-toggle")
        ?.focus({ preventScroll: true });
    };
  }, [menuOpen]);
  return (
    <div className={`consumer-app ${sidebarHidden ? "sidebar-hidden" : ""}`}>
      <a href="#app-main" className="skip-link">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="app-menu-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`app-sidebar ${menuOpen ? "is-open" : ""}`}
        id="app-navigation"
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen || undefined}
        aria-label="Main navigation"
      >
        <div className="sidebar-brand">
          <Brand compact />
          <button
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Your Trove">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} end={end} to={to}>
              <Icon size={21} strokeWidth={1.7} />
              <span>{label}</span>
              <ChevronRight className="nav-chevron" size={15} />
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-body" inert={menuOpen}>
        <header className="app-topbar">
          <div className="app-location">
            <button
              className="desktop-sidebar-toggle"
              aria-label={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
              aria-expanded={!sidebarHidden}
              aria-controls="app-navigation"
              onClick={() => setSidebarHidden(!sidebarHidden)}
            >
              {sidebarHidden ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
            <button
              id="app-menu-toggle"
              className="app-menu-toggle"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              aria-controls="app-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <Menu size={22} />
            </button>
            <Sprout size={17} className="trove-sapling" />
            <span>Trove</span>
            <ChevronRight size={13} />
            <strong>{section}</strong>
          </div>
          <div className="app-topbar-actions">
            <button
              className="text-link account-toggle"
              onClick={() => setAccountOpen(true)}
            >
              {state?.session?.mode === "account"
                ? state.session.username
                : "Sign in"}
            </button>
            <span className="practice-badge">
              <span className="live-dot" />
              Practice mode
            </span>
          </div>
        </header>
        <nav className="app-bottomnav" aria-label="Mobile navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} end={end} to={to}>
              <Icon size={20} strokeWidth={1.7} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sample-strip">
          <span>
            <span className="live-dot" />{" "}
            {state?.session?.mode === "account"
              ? "PRACTICE ACCOUNT"
              : state?.market?.mode === "market"
                ? "GUEST PRACTICE"
                : "SAMPLE EXPERIENCE"}{" "}
            <span className="sample-separator">/</span> Practice funds ·{" "}
            {state?.market?.mode === "market"
              ? `${state.market.provider} · ${state.market.asOf}${state.market.blocked ? " · UPDATING" : state.market.stale ? " · STALE" : ""}`
              : "authored sample prices"}
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
            <Outlet
              key={`${state.id}:${state.session?.username ?? state.role}`}
            />
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
