import type { Actor } from "@rotorsoft/act";
import { ZodEmpty } from "@rotorsoft/act";
import { z } from "zod";

// === Custom Actor ===
export type AppActor = Actor & {
  role: "admin" | "user" | "system";
};

export const systemActor: AppActor = {
  id: "system",
  name: "System",
  role: "system",
};

// === User Actions & Events ===
export const RegisterUser = z.object({
  email: z.string().min(1),
  name: z.string().min(1),
  passwordHash: z.string(),
  role: z.string().optional().default("user"),
});
export const AssignRole = z.object({
  role: z.enum(["admin", "user"]),
});
export const UserRegistered = z.object({
  email: z.string(),
  name: z.string(),
  passwordHash: z.string(),
  role: z.string(),
});
export const RoleAssigned = z.object({
  role: z.string(),
});
export const UserState = z.object({
  email: z.string(),
  name: z.string(),
  passwordHash: z.string(),
  role: z.string(),
});

// === Shared Primitives ===
export const LotType = z.enum(["buy", "sell"]);
export type LotType = z.infer<typeof LotType>;

export const Lot = z.object({
  id: z.string(),
  type: LotType,
  transaction_date: z.iso.date(),
  quantity: z.number(),
  price: z.number(),
  fees: z.number().optional().default(0),
  notes: z.string().optional().default(""),
});
export type Lot = z.infer<typeof Lot>;

export const PositionData = z.object({
  ticker: z.string(),
  notes: z.string(),
  status: z.string(),
  lots: z.array(Lot),
});
export type PositionData = z.infer<typeof PositionData>;

export const PriceRecord = z.object({
  date: z.iso.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional().default(0),
});
export type PriceRecord = z.infer<typeof PriceRecord>;

// === Portfolio Actions ===
export const CreatePortfolio = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  currency: z.string().optional().default("USD"),
  cutoffDate: z.iso.date().optional(),
  dipThreshold: z.number().min(0).max(50).optional().default(5),
  refreshInterval: z.number().min(10).max(3600).optional().default(300),
});
export const UpdatePortfolio = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  cutoffDate: z.iso.date().optional(),
  dipThreshold: z.number().min(0).max(50).optional(),
  refreshInterval: z.number().min(10).max(3600).optional(),
});
export const ArchivePortfolio = ZodEmpty;

export const OpenPosition = z.object({
  ticker: z.string().min(1),
  notes: z.string().optional().default(""),
});
export const ClosePosition = z.object({
  ticker: z.string(),
});
export const AddLot = z.object({
  ticker: z.string(),
  lot: Lot,
});
export const RemoveLot = z.object({
  ticker: z.string(),
  lotId: z.string(),
});

// === Portfolio Events ===
export const PortfolioCreated = z.object({
  name: z.string(),
  description: z.string(),
  currency: z.string(),
  cutoffDate: z.iso.date().optional(),
  dipThreshold: z.number().optional(),
  refreshInterval: z.number().optional(),
  createdBy: z.string(),
});
export const PortfolioUpdated = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  cutoffDate: z.iso.date().optional(),
  dipThreshold: z.number().optional(),
  refreshInterval: z.number().optional(),
});
export const PortfolioArchived = ZodEmpty;
export const PositionOpened = z.object({
  ticker: z.string(),
  notes: z.string(),
});
export const PositionClosed = z.object({
  ticker: z.string(),
});
export const LotAdded = z.object({
  ticker: z.string(),
  lot: Lot,
});
export const LotRemoved = z.object({
  ticker: z.string(),
  lotId: z.string(),
});

// === Portfolio State (includes positions) ===
export const PortfolioState = z.object({
  name: z.string(),
  description: z.string(),
  currency: z.string(),
  cutoffDate: z.string().optional(),
  status: z.string(),
  createdBy: z.string(),
  positions: z.record(z.string(), PositionData),
});
