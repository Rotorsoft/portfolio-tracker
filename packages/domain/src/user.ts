import { projection, slice, state } from "@rotorsoft/act";
import { eq } from "drizzle-orm";
import {
  RegisterUser,
  AssignRole,
  UserRegistered,
  RoleAssigned,
  UserState,
} from "./schemas.js";
import { db, users, str } from "./drizzle/index.js";

// === State ===
export const User = state({ User: UserState })
  .init(() => ({
    email: "",
    name: "",
    passwordHash: "",
    role: "user",
  }))
  .emits({ UserRegistered, RoleAssigned })
  .patch({
    UserRegistered: ({ data }) => ({
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      role: data.role,
    }),
    RoleAssigned: ({ data }) => ({
      role: data.role,
    }),
  })
  .on({ RegisterUser })
  .emit((data) => [
    "UserRegistered",
    {
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      role: data.role ?? "user",
    },
  ])
  .on({ AssignRole })
  .emit((data) => ["RoleAssigned", { role: data.role }])
  .build();

// === Projection (Drizzle PG) ===
export const UserProjection = projection("users")
  .on({ UserRegistered })
  .do(async function handleUserRegistered({ stream, data, created }) {
    await db()
      .insert(users)
      .values({
        email: str(data.email),
        name: str(data.name),
        passwordHash: str(data.passwordHash),
        role: str(data.role),
        createdAt: created.toISOString(),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: str(data.name),
          passwordHash: str(data.passwordHash),
          role: str(data.role),
        },
      });
  })
  .on({ RoleAssigned })
  .do(async function handleRoleAssigned({ stream, data }) {
    await db()
      .update(users)
      .set({ role: str(data.role) })
      .where(eq(users.email, stream));
  })
  .build();

// === Query functions ===
export async function getUserByEmail(email: string) {
  const rows = await db().select().from(users).where(eq(users.email, email));
  return rows[0] ?? null;
}

export async function getAllUsers() {
  return db().select().from(users);
}

// === Slice ===
export const UserSlice = slice()
  .withState(User)
  .withProjection(UserProjection)
  .build();
