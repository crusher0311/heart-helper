import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ==========================================
// Authentication Tables (Username/Password Auth)
// ==========================================

// Session storage table for express-session
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User accounts table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"), // bcrypt hash, null for users who haven't set password
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User preferences table for per-user settings
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  displayName: varchar("display_name"), // Name to use in scripts
  defaultShopId: text("default_shop_id"), // "NB", "WM", or "EV"
  defaultTool: text("default_tool").default("concern_intake"), // "concern_intake" or "sales_script"
  personalTraining: text("personal_training"), // Personal script examples/guidelines
  isManager: boolean("is_manager").default(false), // Can view team analytics
  isAdmin: boolean("is_admin").default(false), // Can manage other users' training
  approvalStatus: text("approval_status").default("pending"), // "approved", "pending", "rejected" - @heartautocare.com auto-approved
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Script feedback tracking for learning
export const scriptFeedback = pgTable("script_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  scriptType: text("script_type").notNull(), // "sales", "concern_intake", etc.
  repairOrderId: integer("repair_order_id"), // Optional link to Tekmetric RO
  sentiment: text("sentiment"), // "positive", "negative", "neutral"
  outcome: text("outcome"), // "approved", "declined", "pending", "no_answer"
  rating: integer("rating"), // 1-5 star rating
  scriptBody: text("script_body"), // The actual script that was generated
  notes: text("notes"), // User's notes about what worked/didn't
  vehicleInfo: jsonb("vehicle_info"), // Vehicle context
  jobInfo: jsonb("job_info"), // Job/repair context
  totalAmount: real("total_amount"), // Dollar amount involved
  createdAt: timestamp("created_at").defaultNow(),
});

// Types for auth
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = typeof userPreferences.$inferInsert;
export type ScriptFeedback = typeof scriptFeedback.$inferSelect;
export type InsertScriptFeedback = typeof scriptFeedback.$inferInsert;

// Insert schemas for auth
export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScriptFeedbackSchema = createInsertSchema(scriptFeedback).omit({ id: true, createdAt: true });

// User preferences with user info combined
export type UserWithPreferences = User & {
  preferences?: UserPreferences;
};

// Tekmetric employees (service writers, technicians, etc.)
export const employees = pgTable("employees", {
  id: integer("id").primaryKey(),
  shopId: varchar("shop_id"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  role: text("role"), // "Service Writer", "Technician", etc.
  isActive: boolean("is_active").default(true),
  rawData: jsonb("raw_data"),
  syncedAt: timestamp("synced_at"),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

// Using existing repair_orders table from Tekmetric integration
export const repairOrders = pgTable("repair_orders", {
  id: integer("id").primaryKey(),
  tekmetricId: integer("tekmetric_id"),
  shopId: varchar("shop_id"),
  customerId: integer("customer_id"),
  serviceWriterId: integer("service_writer_id"),
  serviceWriterName: text("service_writer_name"), // Denormalized for quick access
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
  phoneAnswerScript: text("phone_answer_script"), // Custom phone greeting script
  salesScriptTraining: text("sales_script_training"), // Example scripts and guidelines for AI
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Labor rate groups - admin-managed, per-shop configuration
// These automatically apply labor rates when opening ROs based on vehicle make
export const laborRateGroups = pgTable("labor_rate_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopId: text("shop_id").notNull(), // "NB", "WM", or "EV" (or "ALL" for all shops)
  name: text("name").notNull(), // e.g., "Euro", "Domestic", "Asian"
  makes: text("makes").array().notNull(), // Vehicle makes that belong to this group
  laborRate: integer("labor_rate").notNull(), // Rate in cents (e.g., 27322 = $273.22/hr)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id), // Admin who created this
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
export const insertLaborRateGroupSchema = createInsertSchema(laborRateGroups).omit({ id: true, createdAt: true, updatedAt: true });

// Search request schema
export const searchJobSchema = z.object({
  vehicleMake: z.string().nullish(),
  vehicleModel: z.string().nullish(),
  vehicleYear: z.number().nullish(),
  vehicleEngine: z.string().nullish(),
  repairType: z.string().min(1, "Repair type is required"),
  limit: z.number().default(20),
  broadenStrategy: z.enum(['years', 'models', 'all']).optional(),
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

export type LaborRateGroup = typeof laborRateGroups.$inferSelect;
export type InsertLaborRateGroup = z.infer<typeof insertLaborRateGroupSchema>;

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
  laborTotal?: number; // Computed: hours * rate
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
  totalPrice?: number; // Same as subtotal, for frontend compatibility
  feeTotal?: number;   // For future use
  jobCategoryName?: string;  // For future use
  note?: string;  // For future use
  serviceWriterName?: string;  // Name of the advisor who wrote the estimate
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

// ==========================================
// Concern Intake Types (AI-powered Q&A)
// ==========================================

// Question/answer pair for concern intake
export type ConcernQuestionResponse = {
  question: string;
  answer: string;
};

// Request to generate follow-up questions from initial concern
export const generateConcernQuestionsRequestSchema = z.object({
  customerConcern: z.string().min(1, "Customer concern is required"),
  vehicleInfo: z.object({
    year: z.number().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
});

export type GenerateConcernQuestionsRequest = z.infer<typeof generateConcernQuestionsRequestSchema>;

export type GenerateConcernQuestionsResponse = {
  questions: string[];
};

// Request to review conversation and suggest more questions
export const reviewConcernConversationRequestSchema = z.object({
  customerConcern: z.string().min(1),
  answeredQuestions: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
  vehicleInfo: z.object({
    year: z.number().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
  }).optional(),
});

export type ReviewConcernConversationRequest = z.infer<typeof reviewConcernConversationRequestSchema>;

export type ReviewConcernConversationResponse = {
  additionalQuestions: string[];
  isComplete: boolean;
};

// Request to clean/format conversation into readable paragraph
export const cleanConversationRequestSchema = z.object({
  customerConcern: z.string().min(1),
  answeredQuestions: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
  conversationNotes: z.string().optional(),
});

export type CleanConversationRequest = z.infer<typeof cleanConversationRequestSchema>;

export type CleanConversationResponse = {
  cleanedText: string;
};
