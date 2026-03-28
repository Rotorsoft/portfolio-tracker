import { act } from "@rotorsoft/act";
import type { AppActor } from "./schemas.js";
import { UserSlice } from "./user.js";
import { PortfolioSlice } from "./portfolio.js";

export const app = act()
  .withActor<AppActor>()
  .withSlice(UserSlice)
  .withSlice(PortfolioSlice)
  .build();
