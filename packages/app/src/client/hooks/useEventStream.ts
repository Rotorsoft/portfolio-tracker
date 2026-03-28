import { useCallback, useRef, useState } from "react";
import { trpc } from "../trpc.js";
import type { EventEntry } from "../types.js";

export function useEventStream() {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef(new Set<number>());
  const utils = trpc.useUtils();

  const onData = useCallback(
    (envelope: { id: string; data: any }) => {
      const evt = envelope.data as EventEntry;
      if (seenIds.current.has(evt.id)) return;
      seenIds.current.add(evt.id);
      setEvents((prev) => [...prev, evt]);

      // Invalidate relevant queries based on event name
      if (evt.name.startsWith("Portfolio")) {
        utils.getPortfolios.invalidate();
        utils.getPortfolio.invalidate();
      }
      if (evt.name.startsWith("Position") || evt.name.startsWith("Lot")) {
        utils.getPosition.invalidate();
        utils.getPositionsByPortfolio.invalidate();
        utils.getPosition.invalidate();
        utils.getPortfolioSummary.invalidate();
      }
      if (evt.name.startsWith("Ticker") || evt.name.startsWith("Prices") || evt.name.startsWith("Backfill")) {
        utils.getTickers.invalidate();
        utils.getTicker.invalidate();
        utils.getTickerPrices.invalidate();
      }
    },
    [utils]
  );

  trpc.onEvent.useSubscription(undefined, {
    onStarted: () => setConnected(true),
    onData,
    onError: () => setConnected(false),
  });

  return { events, connected };
}
