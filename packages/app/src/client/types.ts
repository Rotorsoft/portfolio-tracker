export type EventEntry = {
  id: number;
  name: string;
  data: Record<string, unknown>;
  stream: string;
  version: number;
  created: string;
  meta: {
    correlation: string;
    causation: {
      action?: unknown;
      event?: unknown;
    };
  };
};

export type Tab =
  | "portfolios"
  | "positions"
  | "analysis"
  | "backfill"
  | "events";
