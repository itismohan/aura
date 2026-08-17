import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Activity,
  BarChart3,
  CircleHelp,
  FileText,
  Radar,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Home from "./pages/Home";
import SettingsPage from "./pages/Settings";
import { ThemeProvider } from "./contexts/ThemeContext";

export type ViewName = "scan" | "report" | "settings";

function App() {
  const [view, setView] = useState<ViewName>(() => window.location.pathname === "/report" ? "report" : window.location.pathname === "/settings" ? "settings" : "scan");

  useEffect(() => {
    window.history.replaceState({}, "", view === "report" ? "/report" : view === "settings" ? "/settings" : "/");
  }, [view]);

  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <Toaster />
        <div className="aura-app-shell">
          <aside className="aura-sidebar" aria-label="AURA navigation">
            <div className="aura-brand-lockup">
              <div className="aura-brand-image-frame">
                <img src="/manus-storage/aura-sidebar-circle-v3_8cf1a01f.png" alt="AURA — Accessibility Unified Reporting & Analysis" className="aura-brand-image" />
              </div>
              <div className="aura-brand-copy">
                <div className="aura-wordmark">AURA</div>
                <div className="aura-brand-subtitle">Accessibility Unified Reporting &amp; Analysis</div>
              </div>
            </div>

            <div className="aura-sidebar-rule" />
            <div className="aura-nav-label">Workspace</div>
            <nav className="aura-primary-nav">
              <button className={`aura-nav-item ${view === "scan" ? "is-active" : ""}`} onClick={() => setView("scan")} aria-current={view === "scan" ? "page" : undefined}>
                <Radar size={17} strokeWidth={1.8} />
                <span>Scan</span>
                <span className="aura-nav-index">01</span>
              </button>
              <button className={`aura-nav-item ${view === "report" ? "is-active" : ""}`} onClick={() => setView("report")} aria-current={view === "report" ? "page" : undefined}>
                <BarChart3 size={17} strokeWidth={1.8} />
                <span>Report</span>
                <span className="aura-nav-index">02</span>
              </button>
            </nav>

            <div className="aura-sidebar-lower">
              <div className="aura-nav-label">System</div>
              <button className={`aura-nav-item aura-muted-nav ${view === "settings" ? "is-active" : ""}`} onClick={() => setView("settings")} aria-current={view === "settings" ? "page" : undefined}><Settings size={16} /><span>Settings</span></button>
              <button className="aura-nav-item aura-muted-nav"><CircleHelp size={16} /><span>Help center</span></button>
              <button className="aura-nav-item aura-muted-nav"><FileText size={16} /><span>About AURA</span></button>
            </div>

            <div className="aura-sidebar-status">
              <div className="status-dot is-live" />
              <div>
                <div className="status-kicker">Engine status</div>
                <div className="status-value">All systems nominal</div>
              </div>
              <Activity size={15} className="status-activity" />
            </div>
          </aside>

          <main className="aura-main-shell">
            <header className="aura-topbar">
              <div className="aura-breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{view === "scan" ? "Scan" : view === "report" ? "Report" : "Settings"}</strong></div>
              <div className="aura-topbar-actions">
                <div className="aura-standard-chip"><ShieldCheck size={14} /> WCAG 2.1 AA</div>
                <button className="aura-icon-button" aria-label="Open command menu"><Sparkles size={16} /></button>
                <div className="aura-avatar" aria-label="Account: Olivia Park">OP</div>
              </div>
            </header>
            {view === "settings" ? <SettingsPage /> : <Home view={view === "report" ? "report" : "scan"} onViewChange={setView} />}
          </main>
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
