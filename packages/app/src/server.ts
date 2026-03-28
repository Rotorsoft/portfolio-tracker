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
const port = Number(process.env.PORT) || 4000;
server.listen(port);

console.log(`Server listening on http://localhost:${port}`);
