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
  managedShopId: text("managed_shop_id"), // For managers: which shop they manage (can see all calls for this shop)
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

// Password reset tokens for forgot password flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: varchar("token").notNull().unique(), // Secure random token
  expiresAt: timestamp("expires_at").notNull(), // Token expiration (1 hour)
  usedAt: timestamp("used_at"), // When the token was used (null if unused)
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

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
  transcriptionProvider: text("transcription_provider"), // "deepgram", "assemblyai", or "whisper"
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

// Job-based labor rates - fixed rates for specific job types (e.g., Cabin Filter = $100)
// Applies a flat labor charge instead of hourly rate when job name matches keywords
export const jobLaborRates = pgTable("job_labor_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Display name, e.g., "Cabin Air Filter"
  keywords: text("keywords").array().notNull(), // Job name keywords to match (case-insensitive), e.g., ["cabin filter", "cabin air filter"]
  defaultRate: integer("default_rate").notNull(), // Default rate in cents (e.g., 10000 = $100.00)
  shopOverrides: jsonb("shop_overrides").default('{}'), // Per-shop rate overrides: { "NB": 12000, "WM": 11000 }
  isActive: boolean("is_active").default(true), // Whether this rate is currently active
  sortOrder: integer("sort_order").default(0), // Display order in admin UI
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id), // Admin who created this
});

// ==========================================
// Call Coaching Tables (RingCentral Integration)
// ==========================================

// Map RingCentral extensions/users to HEART Helper users
export const ringcentralUsers = pgTable("ringcentral_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  ringcentralExtensionId: text("ringcentral_extension_id"), // RC extension number
  ringcentralUserId: text("ringcentral_user_id"), // RC internal user ID
  phoneNumber: text("phone_number"), // Direct phone number
  displayName: text("display_name"), // Name as it appears in RingCentral
  shopId: text("shop_id"), // Which shop location this user is at ("NB", "WM", "EV")
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Call recordings from RingCentral
export const callRecordings = pgTable("call_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ringcentralCallId: text("ringcentral_call_id").unique(), // RC's unique call identifier
  ringcentralRecordingId: text("ringcentral_recording_id"), // RC's recording ID
  ringcentralSessionId: text("ringcentral_session_id"), // RC session ID - links multiple call legs (holds, transfers) together
  legIndex: integer("leg_index"), // Order of this leg within the session (0, 1, 2...)
  userId: varchar("user_id").references(() => users.id), // Service advisor who handled the call
  shopId: text("shop_id"), // Shop location ("NB", "WM", "EV")
  direction: text("direction"), // "inbound" or "outbound"
  callType: text("call_type").default("sales"), // "sales", "appointment_request", "transfer", "price_shopper"
  customerPhone: text("customer_phone"), // Customer's phone number
  customerName: text("customer_name"), // Customer name if matched from Tekmetric
  tekmetricCustomerId: integer("tekmetric_customer_id"), // Link to Tekmetric customer
  durationSeconds: integer("duration_seconds"),
  recordingUrl: text("recording_url"), // URL to audio file
  recordingStatus: text("recording_status").default("pending"), // "pending", "downloaded", "transcribed", "scored", "error"
  transcript: jsonb("transcript"), // Full transcript with speaker labels
  transcriptText: text("transcript_text"), // Plain text version for search
  aiSummary: text("ai_summary"), // AI-generated call summary
  detectedSpeakerName: text("detected_speaker_name"), // Name detected from "Hi, this is [Name]..."
  isNotSalesCall: boolean("is_not_sales_call").default(false), // User-marked as not a sales call (wrong number, scheduling only, etc.)
  notSalesCallReason: text("not_sales_call_reason"), // Why it's not a sales call: "wrong_number", "scheduling", "vendor", "internal", "other"
  callStartTime: timestamp("call_start_time"),
  callEndTime: timestamp("call_end_time"),
  processedAt: timestamp("processed_at"), // When transcription/scoring completed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_call_recordings_user").on(table.userId),
  index("idx_call_recordings_shop").on(table.shopId),
  index("idx_call_recordings_date").on(table.callStartTime),
  index("idx_call_recordings_type").on(table.callType),
  index("idx_call_recordings_session").on(table.ringcentralSessionId),
]);

// Coaching criteria - admin-configurable grading points
export const coachingCriteria = pgTable("coaching_criteria", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Rapport", "Safety Concern Emphasis"
  description: text("description"), // Detailed description of what to look for
  keywords: text("keywords").array(), // Keywords/phrases that indicate this criterion was met
  aiPrompt: text("ai_prompt"), // Custom AI prompt for scoring this criterion
  weight: integer("weight").default(10), // Weight for overall score calculation
  category: text("category"), // Optional grouping: "greeting", "sales", "closing"
  callTypes: text("call_types").array().default(sql`ARRAY['all']::text[]`), // Array of call types this applies to: "sales", "appointment_request", "price_shopper", "transfer", or "all" for universal
  sortOrder: integer("sort_order").default(0), // Display order
  isActive: boolean("is_active").default(true),
  shopId: text("shop_id"), // null = applies to all shops, or specific shop
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
});

// Call scores - AI scoring results per call
export const callScores = pgTable("call_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").notNull().references(() => callRecordings.id),
  overallScore: integer("overall_score"), // 0-100 overall score
  criteriaScores: jsonb("criteria_scores"), // { criterionId: { score: 0-5, found: boolean, excerpts: string[] } }
  talkRatio: real("talk_ratio"), // Advisor talk time percentage (0-1)
  customerTalkRatio: real("customer_talk_ratio"), // Customer talk time percentage
  avgResponseTime: real("avg_response_time"), // Average seconds before advisor responds
  aiFeedback: text("ai_feedback"), // AI-generated coaching feedback
  aiHighlights: jsonb("ai_highlights"), // Key moments: { timestamp, text, type }
  aiObjections: jsonb("ai_objections"), // Detected objections and how they were handled
  managerNotes: text("manager_notes"), // Manager's additional coaching notes
  reviewedBy: varchar("reviewed_by").references(() => users.id), // Manager who reviewed
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_call_scores_call").on(table.callId),
]);

// Transcript annotations - coaching notes linked to specific text in transcripts
export const transcriptAnnotations = pgTable("transcript_annotations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: varchar("call_id").notNull().references(() => callRecordings.id),
  startOffset: integer("start_offset").notNull(), // Character position where highlight starts
  endOffset: integer("end_offset").notNull(), // Character position where highlight ends
  selectedText: text("selected_text").notNull(), // The actual highlighted text
  note: text("note").notNull(), // Coach's note/feedback about this text
  annotationType: text("annotation_type").default("coaching"), // "coaching", "positive", "needs_improvement", "question"
  criterionId: varchar("criterion_id").references(() => coachingCriteria.id), // Optional link to a coaching criterion
  createdBy: varchar("created_by").notNull().references(() => users.id), // Manager who created annotation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_transcript_annotations_call").on(table.callId),
  index("idx_transcript_annotations_creator").on(table.createdBy),
]);

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
export const insertJobLaborRateSchema = createInsertSchema(jobLaborRates).omit({ id: true, createdAt: true, updatedAt: true });

// Call Coaching insert schemas
export const insertRingcentralUserSchema = createInsertSchema(ringcentralUsers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCallRecordingSchema = createInsertSchema(callRecordings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCoachingCriteriaSchema = createInsertSchema(coachingCriteria).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCallScoreSchema = createInsertSchema(callScores).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTranscriptAnnotationSchema = createInsertSchema(transcriptAnnotations).omit({ id: true, createdAt: true, updatedAt: true });

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
export type JobLaborRate = typeof jobLaborRates.$inferSelect;
export type InsertJobLaborRate = z.infer<typeof insertJobLaborRateSchema>;

// Call Coaching types
export type RingcentralUser = typeof ringcentralUsers.$inferSelect;
export type InsertRingcentralUser = z.infer<typeof insertRingcentralUserSchema>;

export type CallRecording = typeof callRecordings.$inferSelect;
export type InsertCallRecording = z.infer<typeof insertCallRecordingSchema>;

export type CoachingCriteria = typeof coachingCriteria.$inferSelect;
export type InsertCoachingCriteria = z.infer<typeof insertCoachingCriteriaSchema>;

export type CallScore = typeof callScores.$inferSelect;
export type InsertCallScore = z.infer<typeof insertCallScoreSchema>;

export type TranscriptAnnotation = typeof transcriptAnnotations.$inferSelect;
export type InsertTranscriptAnnotation = z.infer<typeof insertTranscriptAnnotationSchema>;

// Criteria score detail for a single criterion
export type CriteriaScoreDetail = {
  criterionId: string;
  score: number; // 0-5
  found: boolean;
  excerpts: string[]; // Relevant quotes from transcript
};

// Call with full score details for API responses
export type CallWithScore = CallRecording & {
  score?: CallScore;
  criteriaDetails?: CriteriaScoreDetail[];
};

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

// ==========================================
// Vehicle History & Warranty Analysis Types
// ==========================================

// Warranty status for a service item
export type WarrantyStatus = 
  | "under_warranty"      // Still covered - don't recommend
  | "serviced_elsewhere"  // Done at another shop (Carfax) - caution
  | "due_for_service"     // Outside warranty/interval - recommend
  | "recently_serviced";  // Done within 3 months - may not need yet

// Individual service record from our history
export type ServiceHistoryItem = {
  id: number;
  jobName: string;
  serviceDate: string;          // ISO date string
  mileage: number;              // Odometer at service
  shopLocation: string;         // "NB", "WM", "EV"
  shopName: string;             // "Northbrook", "Wilmette", "Evanston"
  repairOrderId: number;
  laborCost: number;            // In cents
  partsCost: number;            // In cents
  totalCost: number;            // In cents
  source: "heart" | "carfax";   // Where this record came from
  warrantyStatus: WarrantyStatus;
  warrantyExpiresDate?: string; // When warranty expires (ISO date)
  warrantyExpiresMileage?: number; // Mileage when warranty expires
  daysRemaining?: number;       // Days left on warranty (negative if expired)
  milesRemaining?: number;      // Miles left on warranty (negative if expired)
  serviceWriterName?: string;   // Who wrote the RO
};

// Carfax service record (from Tekmetric API proxy)
export type CarfaxServiceRecord = {
  date: string;
  odometer: number | null;
  description: string;
};

// Combined vehicle service history
export type VehicleServiceHistory = {
  vin: string;
  vehicle?: VehicleInfo;
  heartHistory: ServiceHistoryItem[];      // Services at our shops
  carfaxHistory?: CarfaxServiceRecord[];   // External services (if available)
  currentMileage?: number;                 // Current odometer for calculations
};
