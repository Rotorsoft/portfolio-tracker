import { app } from "@portfolio-tracker/domain";
import { tracked } from "@trpc/server";
import { serializeEvents } from "./helpers.js";
import { t, publicProcedure } from "./trpc.js";

export const eventsRouter = t.router({
  onEvent: publicProcedure.subscription(async function* ({ signal }) {
    const existing = await app.query_array({ after: -1 });
    for (const e of serializeEvents(existing)) {
      yield tracked(String(e.id), e);
    }

    let lastId =
      existing.length > 0 ? existing[existing.length - 1].id : -1;
    let notify: (() => void) | null = null;
    const onSettled = () => {
      if (notify) {
        notify();
        notify = null;
      }
    };
    app.on("settled", onSettled);

    try {
      while (!signal?.aborted) {
        await new Promise<void>((resolve) => {
          notify = resolve;
          signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        if (signal?.aborted) break;

        const newEvents = await app.query_array({ after: lastId });
        for (const e of serializeEvents(newEvents)) {
          yield tracked(String(e.id), e);
          lastId = e.id;
        }
      }
    } finally {
      app.off("settled", onSettled);
    }
  }),
});
