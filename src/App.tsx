import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useEffect } from "react";
import { AppProvider } from "./lib/app-context.tsx";
import { Landing } from "./pages/Landing.tsx";
import { AppLayout } from "./components/AppLayout.tsx";
import { Home } from "./pages/Home.tsx";
import { Company, Explore } from "./pages/Explore.tsx";
import { Decisions } from "./pages/Decisions.tsx";
import { Guide } from "./pages/Learning.tsx";
import { Replay } from "./pages/Replay.tsx";
import { Parent } from "./pages/Parent.tsx";
import { AccountLink } from "./pages/AccountLink.tsx";
import "./App.css";
function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${pathname === "/" ? "Grow your own way" : pathname.includes("explore") ? "Follow your curiosity" : pathname.includes("parent") ? "Room to grow" : pathname.includes("guide") ? "Your learning guide" : pathname.includes("replay") ? "A different perspective" : pathname.includes("decisions") ? "Your decisions" : "Your growth"} — Trove`;
  }, [pathname]);
  return null;
}
export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <PageTitle />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/app/create-account"
            element={<AccountLink purpose="signup" />}
          />
          <Route
            path="/app/verify-email"
            element={<AccountLink purpose="verify" />}
          />
          <Route
            path="/app/reset-password"
            element={<AccountLink purpose="reset" />}
          />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="explore" element={<Explore />} />
            <Route path="explore/:symbol" element={<Company />} />
            <Route path="decisions" element={<Decisions />} />
            <Route path="guide" element={<Guide />} />
            <Route path="replay" element={<Replay />} />
            <Route path="parent" element={<Parent />} />
            <Route path="evidence" element={<Navigate to="/app" replace />} />
          </Route>
          <Route
            path="*"
            element={
              <div className="not-found">
                <h1>A little off the path.</h1>
                <Link className="button" to="/">
                  Find your way back to Trove ↗
                </Link>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
