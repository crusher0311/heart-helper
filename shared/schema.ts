import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Using existing repair_orders table from Tekmetric integration
export const repairOrders = pgTable("repair_orders", {
  id: integer("id").primaryKey(),
  tekmetricId: integer("tekmetric_id"),
  shopId: varchar("shop_id"),
  customerId: integer("customer_id"),
  totalSales: integer("total_sales"),
  laborSales: integer("labor_sales"),
  partsSales: integer("parts_sales"),
  discountTotal: integer("discount_total"),
  laborHoursTotal: real("labor_hours_total"),
  partsCostTotal: integer("parts_cost_total"),
  status: text("status"),
  completedDate: timestamp("completed_date"),
  createdDate: timestamp("created_date"),
  updatedDate: timestamp("updated_date"),
  rawData: jsonb("raw_data"), // Full Tekmetric data
  syncedAt: timestamp("synced_at"),
  postedDate: timestamp("posted_date"),
  subletSales: integer("sublet_sales"),
  feeTotal: integer("fee_total"),
  taxes: integer("taxes"),
});

// Using existing repair_order_jobs table
export const repairOrderJobs = pgTable("repair_order_jobs", {
  id: integer("id").primaryKey(),
  repairOrderId: integer("repair_order_id").references(() => repairOrders.id),
  tekmetricJobId: integer("tekmetric_job_id"),
  name: text("name"),
  laborHours: real("labor_hours"),
  laborCost: integer("labor_cost"),
  partsCost: integer("parts_cost"),
  status: text("status"),
  authorized: integer("authorized"),
  declined: integer("declined"),
  rawData: jsonb("raw_data"), // Full Tekmetric job data
  createdAt: timestamp("created_at"),
});

// Using existing repair_order_job_parts table
export const repairOrderJobParts = pgTable("repair_order_job_parts", {
  id: integer("id").primaryKey(),
  jobId: integer("job_id").references(() => repairOrderJobs.id),
  name: text("name"),
  cost: integer("cost"),
  quantity: real("quantity"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at"),
});

// Using existing vehicles table from Tekmetric sync
export const vehicles = pgTable("vehicles", {
  id: integer("id").primaryKey(),
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  engine: text("engine"),
  vin: text("vin"),
  licensePlate: text("license_plate"),
  color: text("color"),
  customerId: integer("customer_id"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Search requests table to store search history
export const searchRequests = pgTable("search_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleYear: integer("vehicle_year"),
  vehicleEngine: text("vehicle_engine"),
  repairType: text("repair_type").notNull(),
  createdDate: timestamp("created_date").defaultNow(),
  resultsCount: integer("results_count"),
});

// Search cache table to store search results for fast retrieval
export const searchCache = pgTable("search_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  searchHash: text("search_hash").notNull().unique(), // Hash of search params for quick lookup
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleYear: integer("vehicle_year"),
  vehicleEngine: text("vehicle_engine"),
  repairType: text("repair_type").notNull(),
  results: jsonb("results").notNull(), // Full SearchResult[] array
  resultsCount: integer("results_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Auto-expire after 1 hour
});

// User settings table for app configuration
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultShopId: text("default_shop_id"), // "NB", "WM", or "EV"
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const repairOrdersRelations = relations(repairOrders, ({ many }) => ({
  jobs: many(repairOrderJobs),
}));

export const repairOrderJobsRelations = relations(repairOrderJobs, ({ one, many }) => ({
  repairOrder: one(repairOrders, {
    fields: [repairOrderJobs.repairOrderId],
    references: [repairOrders.id],
  }),
  parts: many(repairOrderJobParts),
}));

export const repairOrderJobPartsRelations = relations(repairOrderJobParts, ({ one }) => ({
  job: one(repairOrderJobs, {
    fields: [repairOrderJobParts.jobId],
    references: [repairOrderJobs.id],
  }),
}));

// Zod schemas for inserts
export const insertRepairOrderSchema = createInsertSchema(repairOrders);
export const insertRepairOrderJobSchema = createInsertSchema(repairOrderJobs);
export const insertRepairOrderJobPartSchema = createInsertSchema(repairOrderJobParts);
export const insertSearchRequestSchema = createInsertSchema(searchRequests).omit({ id: true, createdDate: true });
export const insertSearchCacheSchema = createInsertSchema(searchCache).omit({ id: true, createdAt: true });
export const insertSettingsSchema = createInsertSchema(settings).omit({ id: true, updatedAt: true });

// Search request schema
export const searchJobSchema = z.object({
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleYear: z.number().optional(),
  vehicleEngine: z.string().optional(),
  repairType: z.string().min(1, "Repair type is required"),
  limit: z.number().default(20),
});

// Types
export type RepairOrder = typeof repairOrders.$inferSelect;
export type InsertRepairOrder = z.infer<typeof insertRepairOrderSchema>;

export type RepairOrderJob = typeof repairOrderJobs.$inferSelect;
export type InsertRepairOrderJob = z.infer<typeof insertRepairOrderJobSchema>;

export type RepairOrderJobPart = typeof repairOrderJobParts.$inferSelect & {
  brand?: string;
  partNumber?: string;
  retail?: number;
};
export type InsertRepairOrderJobPart = z.infer<typeof insertRepairOrderJobPartSchema>;

export type SearchRequest = typeof searchRequests.$inferSelect;
export type InsertSearchRequest = z.infer<typeof insertSearchRequestSchema>;

export type SearchCache = typeof searchCache.$inferSelect;
export type InsertSearchCache = z.infer<typeof insertSearchCacheSchema>;

export type SearchJobRequest = z.infer<typeof searchJobSchema>;

export type Vehicle = typeof vehicles.$inferSelect;

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

// Vehicle info extracted from raw_data
export type VehicleInfo = {
  id?: number;
  make?: string;
  model?: string;
  year?: number;
  engine?: string;
  vin?: string;
};

// Labor item extracted from raw_data
export type LaborItem = {
  id: number;
  name: string;
  hours: number;
  rate: number;
  technicianId?: number;
};

// Combined types for API responses
export type JobWithDetails = {
  id: number;
  repairOrderId: number;
  name: string;
  laborHours: number;
  laborCost: number;
  partsCost: number;
  status: string;
  authorized: boolean;
  vehicle?: VehicleInfo;
  laborItems: LaborItem[];
  parts: RepairOrderJobPart[];
  repairOrder?: RepairOrder;
  subtotal: number;
  laborTotal: number;  // Computed: sum of labor hours * rates
  partsTotal: number;  // Computed: sum of parts cost * quantity
  feeTotal?: number;   // For future use
  jobCategoryName?: string;  // For future use
  note?: string;  // For future use
};

export type SearchResult = {
  job: JobWithDetails;
  matchScore: number;
  matchReason: string;
};

// Shop location types and names
export type ShopLocation = "NB" | "WM" | "EV";

export const SHOP_NAMES: Record<ShopLocation, string> = {
  NB: "Northbrook",
  WM: "Wilmette",
  EV: "Evanston",
};
