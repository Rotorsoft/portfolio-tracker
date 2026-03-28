import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { app, getUserByEmail, getAllUsers, systemActor } from "@portfolio-tracker/domain";
import { hashPassword, signToken, verifyPassword } from "./auth.js";
import { t, publicProcedure, authedProcedure } from "./trpc.js";
import { doAction } from "./app.js";

export const authRouter = t.router({
  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      const user = await getUserByEmail(input.username);
      if (!user || !user.passwordHash)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      if (!verifyPassword(input.password, user.passwordHash))
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      const token = signToken({ email: user.email });
      return { user: { id: user.email, name: user.name, role: user.role }, token };
    }),

  signup: publicProcedure
    .input(
      z.object({
        username: z.string(),
        name: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await getUserByEmail(input.username);
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
        });
      const passwordHash = hashPassword(input.password);
      await doAction(
        "RegisterUser",
        { stream: input.username, actor: systemActor },
        { email: input.username, name: input.name, passwordHash, role: "user" }
      );
      // Wait for user projection to write to DB before returning
      await new Promise<void>((resolve) => {
        app.on("settled", function handler() { app.off("settled", handler); resolve(); });
        app.settle();
      });
      const token = signToken({ email: input.username });
      return {
        user: { id: input.username, name: input.name, role: "user" as const },
        token,
      };
    }),

  me: authedProcedure.query(({ ctx }) => ctx.actor),

  assignRole: authedProcedure
    .input(z.object({ email: z.string(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      const user = await getUserByEmail(input.email);
      if (!user)
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      await doAction(
        "AssignRole",
        { stream: input.email, actor: ctx.actor },
        { role: input.role }
      );
      app.settle();
      return { success: true };
    }),

  listUsers: authedProcedure.query(async () => {
    const all = await getAllUsers();
    return all.map(({ passwordHash: _, ...profile }) => profile);
  }),
});
