import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Vehicles table - IDs come from Tekmetric API
export const vehicles = pgTable("vehicles", {
  id: integer("id").primaryKey(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  engine: text("engine"),
  vin: text("vin"),
  customerId: integer("customer_id"),
});

// Repair Orders table - IDs come from Tekmetric API
export const repairOrders = pgTable("repair_orders", {
  id: integer("id").primaryKey(),
  repairOrderNumber: integer("repair_order_number").notNull(),
  shopId: integer("shop_id"),
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  customerId: integer("customer_id"),
  technicianId: integer("technician_id"),
  serviceWriterId: integer("service_writer_id"),
  status: text("status").notNull(),
  statusColor: text("status_color"),
  milesIn: integer("miles_in"),
  milesOut: integer("miles_out"),
  completedDate: timestamp("completed_date"),
  postedDate: timestamp("posted_date"),
  laborSales: integer("labor_sales").default(0),
  partsSales: integer("parts_sales").default(0),
  subletSales: integer("sublet_sales").default(0),
  discountTotal: integer("discount_total").default(0),
  feeTotal: integer("fee_total").default(0),
  taxes: integer("taxes").default(0),
  totalSales: integer("total_sales").default(0),
  createdDate: timestamp("created_date").defaultNow(),
});

// Jobs table - IDs come from Tekmetric API
export const jobs = pgTable("jobs", {
  id: integer("id").primaryKey(),
  repairOrderId: integer("repair_order_id").references(() => repairOrders.id),
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  customerId: integer("customer_id"),
  name: text("name").notNull(),
  authorized: boolean("authorized").default(false),
  authorizedDate: timestamp("authorized_date"),
  selected: boolean("selected").default(true),
  technicianId: integer("technician_id"),
  note: text("note"),
  cannedJobId: integer("canned_job_id"),
  jobCategoryName: text("job_category_name"),
  partsTotal: integer("parts_total").default(0),
  laborTotal: integer("labor_total").default(0),
  discountTotal: integer("discount_total").default(0),
  feeTotal: integer("fee_total").default(0),
  subtotal: integer("subtotal").default(0),
  archived: boolean("archived").default(false),
  createdDate: timestamp("created_date").defaultNow(),
  completedDate: timestamp("completed_date"),
  updatedDate: timestamp("updated_date"),
  laborHours: numeric("labor_hours", { precision: 10, scale: 2 }),
});

// Labor items table - IDs come from Tekmetric API  
export const laborItems = pgTable("labor_items", {
  id: integer("id").primaryKey(),
  jobId: integer("job_id").references(() => jobs.id),
  name: text("name").notNull(),
  rate: integer("rate").notNull(),
  hours: numeric("hours", { precision: 10, scale: 2 }).notNull(),
  complete: boolean("complete").default(false),
  technicianId: integer("technician_id"),
});

// Parts table - IDs come from Tekmetric API
export const parts = pgTable("parts", {
  id: integer("id").primaryKey(),
  jobId: integer("job_id").references(() => jobs.id),
  quantity: integer("quantity").notNull(),
  brand: text("brand"),
  name: text("name").notNull(),
  partNumber: text("part_number"),
  description: text("description"),
  cost: integer("cost").notNull(),
  retail: integer("retail").notNull(),
  partType: text("part_type"),
  partStatus: text("part_status"),
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

// Relations
export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  repairOrders: many(repairOrders),
  jobs: many(jobs),
}));

export const repairOrdersRelations = relations(repairOrders, ({ one, many }) => ({
  vehicle: one(vehicles, {
    fields: [repairOrders.vehicleId],
    references: [vehicles.id],
  }),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  repairOrder: one(repairOrders, {
    fields: [jobs.repairOrderId],
    references: [repairOrders.id],
  }),
  vehicle: one(vehicles, {
    fields: [jobs.vehicleId],
    references: [vehicles.id],
  }),
  laborItems: many(laborItems),
  parts: many(parts),
}));

export const laborItemsRelations = relations(laborItems, ({ one }) => ({
  job: one(jobs, {
    fields: [laborItems.jobId],
    references: [jobs.id],
  }),
}));

export const partsRelations = relations(parts, ({ one }) => ({
  job: one(jobs, {
    fields: [parts.jobId],
    references: [jobs.id],
  }),
}));

// Zod schemas for inserts
export const insertVehicleSchema = createInsertSchema(vehicles);
export const insertRepairOrderSchema = createInsertSchema(repairOrders);
export const insertJobSchema = createInsertSchema(jobs);
export const insertLaborItemSchema = createInsertSchema(laborItems);
export const insertPartSchema = createInsertSchema(parts);
export const insertSearchRequestSchema = createInsertSchema(searchRequests).omit({ id: true, createdDate: true });

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
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;

export type RepairOrder = typeof repairOrders.$inferSelect;
export type InsertRepairOrder = z.infer<typeof insertRepairOrderSchema>;

export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;

export type LaborItem = typeof laborItems.$inferSelect;
export type InsertLaborItem = z.infer<typeof insertLaborItemSchema>;

export type Part = typeof parts.$inferSelect;
export type InsertPart = z.infer<typeof insertPartSchema>;

export type SearchRequest = typeof searchRequests.$inferSelect;
export type InsertSearchRequest = z.infer<typeof insertSearchRequestSchema>;

export type SearchJobRequest = z.infer<typeof searchJobSchema>;

// Combined types for API responses
export type JobWithDetails = Job & {
  vehicle?: Vehicle;
  laborItems: LaborItem[];
  parts: Part[];
  repairOrder?: RepairOrder;
};

export type SearchResult = {
  job: JobWithDetails;
  matchScore: number;
  matchReason: string;
};
