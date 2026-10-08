import { z } from "zod";
const ASSET_ID = /^(agent|instruction|skill|hook)\/[A-Za-z0-9._-]+$/;
export const Upstream = z.object({
  schema: z.literal(1),
  source: z.object({ type: z.literal("github"), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), ref: z.string().default("main") })
}).strict();
export const Pack = z.object({
  schema: z.literal(1),
  id: z.string().regex(/^pack\/[a-z0-9-]+$/, "pack id must be pack/name"),
  title: z.string().min(3),
  description: z.string().min(10),
  roles: z.array(z.string()).default([]),
  assets: z.array(z.string().regex(ASSET_ID, "asset ids look like agent/name, instruction/name, skill/name, hook/name")).min(1)
}).strict();
export const Roles = z.record(z.array(z.string().min(2)));
export const Paths = z.object({ schema: z.literal(1), global: z.record(z.string()), local: z.record(z.string()) }).strict();
