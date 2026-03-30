import { getUserByEmail, type AppActor } from "@rotorsoft/portfolio-tracker-domain";
import { verifyToken } from "./auth.js";

export type Context = { actor: AppActor | null };

export async function createContext({
  req,
}: {
  req: { headers: Record<string, string | string[] | undefined> };
}): Promise<Context> {
  const auth = req.headers["authorization"];
  const token =
    typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const user = await getUserByEmail(payload.email);
      if (user)
        return {
          actor: { id: user.email, name: user.name, role: user.role as AppActor["role"] },
        };
    }
  }
  return { actor: null };
}
