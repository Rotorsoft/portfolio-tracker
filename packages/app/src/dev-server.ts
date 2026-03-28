import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { router, createContext } from "./api/index.js";
import { bootstrap } from "./bootstrap.js";

await bootstrap();

const server = createHTTPServer({
  middleware: cors({ origin: true, credentials: true }),
  router,
  createContext,
});
server.listen(4000);

console.log("API server running at http://localhost:4000");
