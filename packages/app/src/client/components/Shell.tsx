import { useState } from "react";
import { LogOut, Terminal, Calendar } from "lucide-react";
import { Tooltip } from "./Tooltip.js";
import { HolidayManager } from "./HolidayManager.js";
import { useAuth } from "../hooks/useAuth.js";
import { useEventStream } from "../hooks/useEventStream.js";
import { useNav } from "../hooks/useNav.js";
import { useServerDown } from "../App.js";
import { LoginForm } from "./LoginForm.js";
import { PortfolioList } from "../views/PortfolioList.js";
import { PortfolioDetail } from "../views/PortfolioDetail.js";
import { EventLog } from "../views/EventLog.js";


export function Shell() {
  const { user, loading, signOut } = useAuth();
  const { events } = useEventStream();
  const serverDown = useServerDown();
  const { route, nav } = useNav();

  const [showHolidays, setShowHolidays] = useState(false);
  const activeTab = route.page === "events" ? "events" : "portfolios";

  if (loading && !serverDown) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (serverDown) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-400 text-5xl">!</div>
          <h2 className="text-xl font-semibold text-white">Server Unavailable</h2>
          <p className="text-gray-400 text-sm max-w-sm">
            Cannot connect to the server. Make sure it is running and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) return <LoginForm />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <button onClick={() => nav.toPortfolios()} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <svg viewBox="0 0 32 32" className="w-7 h-7">
                <rect width="32" height="32" rx="6" fill="#1e1b4b"/>
                <path d="M6 22 L12 14 L17 18 L26 8" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M6 22 L12 14 L17 18 L26 8 L26 22 Z" fill="#6366f1" fillOpacity="0.15"/>
                <circle cx="26" cy="8" r="2" fill="#10b981"/>
              </svg>
              <h1 className="text-lg font-semibold tracking-tight text-white hidden sm:block">
                Portfolio Tracker
              </h1>
            </button>
            <div className="flex items-center gap-4">
              <Tooltip label="Market holidays">
                <button onClick={() => setShowHolidays(true)} className="text-gray-600 hover:text-gray-300 transition-colors">
                  <Calendar size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Event log">
                <button onClick={() => nav.toEvents()} className={`text-gray-600 hover:text-gray-300 transition-colors ${activeTab === "events" ? "text-gray-300" : ""}`}>
                  <Terminal size={14} />
                </button>
              </Tooltip>
              <span className="text-sm text-gray-400">{user.name}</span>
              <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1">
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {route.page === "portfolios" && (
          <PortfolioList onSelect={(id) => nav.toPortfolio(id)} />
        )}
        {(route.page === "portfolio" || route.page === "position") && (
          <PortfolioDetail
            portfolioId={route.portfolioId}
            onBack={() => nav.toPortfolioList()}
          />
        )}
        {route.page === "events" && <EventLog events={events} />}
      </main>
      {showHolidays && <HolidayManager onClose={() => setShowHolidays(false)} />}
    </div>
  );
}
