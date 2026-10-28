import { useEffect, useLayoutEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Compass,
  Home,
  LogIn,
  ListOrdered,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sprout,
  UserRound,
  X,
} from "lucide-react";
import { Brand } from "./Brand.tsx";
import { AccountRequired } from "./AccountRequired.tsx";
import { useApp } from "../lib/app-context.tsx";
import { AccountDialog } from "./AccountDialog.tsx";
import { HowItWorksDialog } from "./HowItWorksDialog.tsx";

export function AppLayout() {
  const { state, error, refresh, toast } = useApp(),
    location = useLocation(),
    [menuOpen, setMenuOpen] = useState(false),
    [accountOpen, setAccountOpen] = useState(
      () => new URLSearchParams(location.search).get("signin") === "1",
    ),
    [explanationOpen, setExplanationOpen] = useState(false),
    [accountMode, setAccountMode] = useState<"login" | "register">("login"),
    [sidebarHidden, setSidebarHidden] = useState(() => {
      try {
        return localStorage.getItem("trove-sidebar-hidden") === "1";
      } catch {
        return false;
      }
    });
  const privatePage = {
    "/app": {
      title: "Your portfolio starts here.",
      description:
        "Create a family account to start practicing, or sign in to continue where you left off.",
    },
    "/app/decisions": {
      title: "Your decisions, saved here.",
      description:
        "Sign in to revisit your practice choices and the thinking behind them.",
    },
    "/app/parent": {
      title: "Guide your learner's practice.",
      description:
        "Create a family account to invite a learner, set limits, and review their requests.",
    },
    "/app/replay": {
      title: "Take another look at your choices.",
      description:
        "Sign in to compare allocations and explore how a different choice could have played out.",
    },
  }[location.pathname.replace(/\/$/, "")];
  const portfolioLocked =
    Boolean(privatePage) && state?.session?.mode !== "account";
  function openAccount(mode: "login" | "register" = "login") {
    setAccountMode(mode);
    setAccountOpen(true);
  }
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
      : (navigation.find((item) =>
          item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to),
        )?.label ?? "Home");
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const waitingForParent =
      state?.session?.mode === "account" &&
      state.role === "learner" &&
      state.approvals.some(
        (a) =>
          a.state === "requested" &&
          a.quote.expiresAt > Date.now() &&
          a.quote.sequence === state.sequence &&
          a.quote.revision === state.policy.revision,
      );
    const setupPending =
      state?.session?.mode === "account" &&
      state.chain?.ready &&
      (!state.chain.account || state.chain.learnerBound === false);
    const fastPrices = state?.market?.quoteMode === "intraday";
    if (
      !state?.market?.blocked &&
      !state?.chain?.pending?.length &&
      !waitingForParent &&
      !setupPending &&
      !fastPrices
    )
      return;
    const timer = setInterval(
      () => {
        if (!document.hidden) void refresh();
      },
      fastPrices &&
        !state?.market?.blocked &&
        !state?.chain?.pending?.length &&
        !waitingForParent &&
        !setupPending
        ? 30000
        : 3000,
    );
    return () => clearInterval(timer);
  }, [
    state?.market?.blocked,
    state?.market?.quoteMode,
    state?.chain?.pending?.length,
    state?.approvals,
    state?.chain?.ready,
    state?.chain?.account,
    state?.chain?.learnerBound,
    state?.session?.mode,
    state?.role,
    state?.sequence,
    state?.policy.revision,
    refresh,
  ]);
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
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
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
              className="button compact account-toggle"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              onClick={() => openAccount()}
            >
              <span>
                {state?.session?.mode === "account"
                  ? state.session.username
                  : "Sign in"}
              </span>
              {state?.session?.mode === "account" ? (
                <UserRound size={17} aria-hidden="true" />
              ) : (
                <LogIn size={17} aria-hidden="true" />
              )}
            </button>
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
        {!portfolioLocked && (
          <div className="sample-strip">
            <span
              data-mobile-label={
                state?.market?.mode === "market"
                  ? `Market close · ${state.market.asOf}`
                  : "Sample prices · practice funds"
              }
            >
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
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setExplanationOpen(true)}
            >
              What this does <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        )}
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
          ) : portfolioLocked ? (
            <AccountRequired
              title={privatePage!.title}
              description={privatePage!.description}
              onSignIn={() => openAccount()}
              onCreate={() => openAccount("register")}
              onLearnMore={() => setExplanationOpen(true)}
            />
          ) : (
            <Outlet
              context={{ openAccount }}
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
      {accountOpen && (
        <AccountDialog
          initialMode={accountMode}
          onClose={() => setAccountOpen(false)}
        />
      )}
      {explanationOpen && (
        <HowItWorksDialog onClose={() => setExplanationOpen(false)} />
      )}
    </div>
  );
}
