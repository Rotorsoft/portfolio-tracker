import { app } from "@portfolio-tracker/domain";

/** Always use the last snapshot (handles multi-event actions) */
export async function doAction(
  action: Parameters<typeof app.do>[0],
  target: Parameters<typeof app.do>[1],
  payload: Parameters<typeof app.do>[2]
) {
  const snaps = await app.do(action, target, payload);
  return snaps[snaps.length - 1];
}
