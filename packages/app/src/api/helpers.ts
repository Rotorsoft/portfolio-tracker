export type SerializedEvent = {
  id: number;
  name: string;
  data: Record<string, unknown>;
  stream: string;
  version: number;
  created: string;
  meta: {
    correlation: string;
    causation: { action?: unknown; event?: unknown };
  };
};

export function serializeEvents(
  events: Array<{
    id: number;
    name: unknown;
    data: unknown;
    stream: string;
    version: number;
    created: Date;
    meta: unknown;
  }>
): SerializedEvent[] {
  return events.map((e) => ({
    id: e.id,
    name: e.name as string,
    data: e.data as Record<string, unknown>,
    stream: e.stream,
    version: e.version,
    created: e.created.toISOString(),
    meta: e.meta as SerializedEvent["meta"],
  }));
}
