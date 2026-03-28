import { useSyncExternalStore, useCallback } from "react";

export type SubTab = "positions" | "analysis" | "prices";

type Route =
  | { page: "portfolios" }
  | { page: "portfolio"; portfolioId: string; tab: SubTab }
  | { page: "position"; portfolioId: string; ticker: string }
  | { page: "events" };

const validTabs = new Set<SubTab>(["positions", "analysis", "prices"]);

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "events") return { page: "events" };
  if (parts[0] === "portfolios" && parts[1] && parts[2]) {
    const tab = parts[2] as SubTab;
    if (validTabs.has(tab)) return { page: "portfolio", portfolioId: parts[1], tab };
    // Anything else is a ticker
    return { page: "position", portfolioId: parts[1], ticker: parts[2] };
  }
  if (parts[0] === "portfolios" && parts[1]) return { page: "portfolio", portfolioId: parts[1], tab: "positions" };
  return { page: "portfolios" };
}

let _prevHash = window.location.hash;
let _cached: Route = parse(_prevHash);
let _lastPortfolioHash: string | null =
  (_cached.page === "portfolio" || _cached.page === "position") ? _prevHash : null;

function onHashChange() {
  // Save the old hash if it was any portfolio-area route
  const prevRoute = _cached;
  if (prevRoute.page !== "events") {
    _lastPortfolioHash = _prevHash;
  }
  _prevHash = window.location.hash;
  _cached = parse(_prevHash);
  _listeners.forEach((l) => l());
}

function getRoute(): Route {
  return _cached;
}

const _listeners = new Set<() => void>();
window.addEventListener("hashchange", onHashChange);

export function useNav() {
  const route = useSyncExternalStore(
    useCallback((cb: () => void) => { _listeners.add(cb); return () => { _listeners.delete(cb); }; }, []),
    getRoute,
  );

  const nav = {
    toPortfolios: () => { window.location.hash = _lastPortfolioHash ?? "#/portfolios"; },
    toPortfolioList: () => { window.location.hash = "#/portfolios"; },
    toPortfolio: (id: string, tab?: SubTab) => {
      window.location.hash = tab && tab !== "positions" ? `#/portfolios/${id}/${tab}` : `#/portfolios/${id}`;
    },
    toPosition: (portfolioId: string, ticker: string) => {
      window.location.hash = `#/portfolios/${portfolioId}/${ticker}`;
    },
    toEvents: () => { window.location.hash = "#/events"; },
    back: () => { window.history.back(); },
  };

  return { route, nav };
}
