import type {
  RepairOrder,
  RepairOrderJob,
  RepairOrderJobPart,
  InsertSearchRequest,
  SearchRequest,
  SearchJobRequest,
  JobWithDetails,
  VehicleInfo,
  LaborItem,
  Settings,
  InsertSettings,
  SearchCache,
  SearchResult,
  User,
  UpsertUser,
  UserPreferences,
  InsertUserPreferences,
  ScriptFeedback,
  InsertScriptFeedback,
  UserWithPreferences,
  LaborRateGroup,
  InsertLaborRateGroup,
  RingcentralUser,
  InsertRingcentralUser,
  CallRecording,
  InsertCallRecording,
  CoachingCriteria,
  InsertCoachingCriteria,
  CallScore,
  InsertCallScore,
} from "@shared/schema";
import { db } from "./db";
import { repairOrders, repairOrderJobs, repairOrderJobParts, searchRequests, vehicles, settings, searchCache, users, userPreferences, scriptFeedback, laborRateGroups, ringcentralUsers, callRecordings, coachingCriteria, callScores } from "@shared/schema";
import { eq, and, or, like, ilike, sql, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";
import { getModelVariations } from "./vehicle-utils";

export interface IStorage {
  // Search jobs based on criteria
  searchJobs(params: {
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehicleYear?: number | null;
    vehicleEngine?: string | null;
    repairType: string;
    limit?: number;
    yearRange?: number;
    searchTerms?: string[]; // AI-extracted repair terms for smarter matching
  }): Promise<JobWithDetails[]>;
  
  // Get a single job by ID
  getJobById(id: number): Promise<JobWithDetails | null>;
  
  // Get a repair order by ID
  getRepairOrderById(id: number): Promise<RepairOrder | null>;
  
  // Create search request log
  createSearchRequest(data: InsertSearchRequest): Promise<SearchRequest>;
  
  // Settings
  getSettings(): Promise<Settings | null>;
  updateSettings(data: InsertSettings): Promise<Settings>;
  
  // Search cache
  getCachedSearch(params: SearchJobRequest): Promise<SearchResult[] | null>;
  setCachedSearch(params: SearchJobRequest, results: SearchResult[]): Promise<void>;
  getRecentSearches(limit?: number): Promise<SearchCache[]>;
  cleanExpiredCache(): Promise<void>;
  
  // User operations (username/password auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<(User & { passwordHash: string | null }) | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUserWithPassword(data: { email: string; passwordHash: string; firstName?: string | null; lastName?: string | null }): Promise<User>;
  updateUserLastLogin(userId: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  
  // User preferences
  getUserPreferences(userId: string): Promise<UserPreferences | undefined>;
  upsertUserPreferences(userId: string, prefs: Partial<InsertUserPreferences>): Promise<UserPreferences>;
  getUserWithPreferences(userId: string): Promise<UserWithPreferences | undefined>;
  
  // Script feedback
  createScriptFeedback(feedback: InsertScriptFeedback): Promise<ScriptFeedback>;
  getUserFeedback(userId: string, limit?: number): Promise<ScriptFeedback[]>;
  getPositiveFeedbackForUser(userId: string, scriptType?: string): Promise<ScriptFeedback[]>;
  
  // Admin operations
  isUserAdmin(userId: string): Promise<boolean>;
  getAllUsersWithPreferences(): Promise<UserWithPreferences[]>;
  updateUserTrainingAsAdmin(targetUserId: string, training: string): Promise<UserPreferences>;
  createUserAsAdmin(userData: { email: string; firstName: string; lastName: string; isAdmin?: boolean; passwordHash?: string }): Promise<User>;
  deleteUserAsAdmin(userId: string): Promise<void>;
  updateUserAdminStatus(userId: string, isAdmin: boolean): Promise<UserPreferences>;
  
  // Approval workflow
  ensureUserPreferencesOnLogin(userId: string, email: string | null): Promise<UserPreferences>;
  isUserApproved(userId: string): Promise<boolean>;
  getPendingApprovalUsers(): Promise<UserWithPreferences[]>;
  updateUserApprovalStatus(userId: string, status: 'approved' | 'rejected'): Promise<UserPreferences>;
  
  // Labor rate groups (admin-managed, per-shop configuration)
  getLaborRateGroups(shopId?: string): Promise<LaborRateGroup[]>;
  createLaborRateGroup(data: InsertLaborRateGroup): Promise<LaborRateGroup>;
  updateLaborRateGroup(id: string, data: Partial<InsertLaborRateGroup>): Promise<LaborRateGroup>;
  deleteLaborRateGroup(id: string): Promise<void>;
  
  // RingCentral user mappings
  getAllRingcentralUsers(): Promise<RingcentralUser[]>;
  getRingcentralUserByExtensionId(extensionId: string): Promise<RingcentralUser | undefined>;
  getRingcentralUserByUserId(userId: string): Promise<RingcentralUser | undefined>;
  createRingcentralUser(data: InsertRingcentralUser): Promise<RingcentralUser>;
  updateRingcentralUser(id: string, data: Partial<InsertRingcentralUser>): Promise<RingcentralUser>;
  deleteRingcentralUser(id: string): Promise<void>;
  upsertRingcentralUserMapping(extensionId: string, userId: string, extensionNumber: string, extensionName: string): Promise<RingcentralUser>;
  
  // Call recordings
  getCallRecordingByRingcentralId(callId: string): Promise<CallRecording | undefined>;
  getCallRecordingById(id: string): Promise<CallRecording | undefined>;
  createCallRecording(data: InsertCallRecording): Promise<CallRecording>;
  updateCallRecording(id: string, data: Partial<InsertCallRecording>): Promise<CallRecording>;
  getCallRecordingsForUser(userId: string, dateFrom?: Date, dateTo?: Date, limit?: number, direction?: string): Promise<CallRecording[]>;
  getCallRecordingsForShop(shopId: string, dateFrom?: Date, dateTo?: Date, limit?: number, direction?: string): Promise<CallRecording[]>;
  getAllCallRecordings(dateFrom?: Date, dateTo?: Date, limit?: number, direction?: string): Promise<CallRecording[]>;
  
  // Coaching criteria
  getActiveCoachingCriteria(shopId?: string): Promise<CoachingCriteria[]>;
  getAllCoachingCriteria(): Promise<CoachingCriteria[]>;
  getCoachingCriteriaById(id: string): Promise<CoachingCriteria | undefined>;
  createCoachingCriteria(data: InsertCoachingCriteria): Promise<CoachingCriteria>;
  updateCoachingCriteria(id: string, data: Partial<InsertCoachingCriteria>): Promise<CoachingCriteria>;
  deleteCoachingCriteria(id: string): Promise<void>;
  
  // Call scores
  getCallScore(callId: string): Promise<CallScore | undefined>;
  createCallScore(data: InsertCallScore): Promise<CallScore>;
  updateCallScore(id: string, data: Partial<InsertCallScore>): Promise<CallScore>;
}

export class DatabaseStorage implements IStorage {
  
  async searchJobs(params: {
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehicleYear?: number | null;
    vehicleEngine?: string | null;
    repairType: string;
    limit?: number;
    yearRange?: number;
    searchTerms?: string[]; // Optional: pre-extracted search terms from AI
  }): Promise<JobWithDetails[]> {
    const limit = params.limit || 50;
    
    console.log('searchJobs called with params:', JSON.stringify(params));

    // Build the query conditions
    const conditions = [];

    // Search repair type in job name (broad search, case-insensitive)
    // If searchTerms are provided (from AI extraction), use OR logic to match ANY term
    // Otherwise fall back to original behavior (exact phrase match)
    if (params.searchTerms && params.searchTerms.length > 0) {
      console.log(`Using AI-extracted search terms: ${params.searchTerms.join(', ')}`);
      const termConditions = params.searchTerms.map(term => 
        ilike(repairOrderJobs.name, `%${term}%`)
      );
      conditions.push(or(...termConditions));
    } else {
      // Fallback: use original repair type as-is
      conditions.push(
        ilike(repairOrderJobs.name, `%${params.repairType}%`)
      );
    }

    // Add vehicle filters if provided
    if (params.vehicleMake) {
      conditions.push(ilike(vehicles.make, `%${params.vehicleMake}%`));
    }

    if (params.vehicleModel) {
      // Smart model matching with variations (F150 = F-150, etc.)
      // Also extracts base model for trim matching (4Runner TRD Pro → 4Runner)
      const modelVariations = getModelVariations(params.vehicleModel);
      const modelWords = params.vehicleModel.split(/\s+/).filter(w => w.length > 0);
      const baseModel = modelWords[0]; // First word is usually the model name
      
      // Build OR conditions for all variations
      const modelConditions = modelVariations.map(variation => 
        ilike(vehicles.model, `%${variation}%`)
      );
      
      // Also add base model if it's different from the input
      if (modelWords.length > 1 && !modelVariations.includes(baseModel)) {
        modelConditions.push(ilike(vehicles.model, `%${baseModel}%`));
      }
      
      if (modelConditions.length > 0) {
        conditions.push(or(...modelConditions));
        console.log(`Model matching: searching for ${modelVariations.length} variations of "${params.vehicleModel}"`);
      }
    }

    if (params.vehicleYear) {
      if (params.yearRange) {
        // Use year range (e.g., ±2 years)
        conditions.push(
          and(
            gte(vehicles.year, params.vehicleYear - params.yearRange),
            lte(vehicles.year, params.vehicleYear + params.yearRange)
          )
        );
      } else {
        // Exact year match
        conditions.push(eq(vehicles.year, params.vehicleYear));
      }
    }

    if (params.vehicleEngine) {
      // Allow NULL engine values to pass through (many vehicles don't have engine data)
      conditions.push(
        or(
          ilike(vehicles.engine, `%${params.vehicleEngine}%`),
          sql`${vehicles.engine} IS NULL OR ${vehicles.engine} = ''`
        )
      );
    }

    // Execute query with triple join: jobs -> repair_orders -> vehicles
    // We need to extract vehicleId from the job's raw_data
    const results = await db
      .select({
        job: repairOrderJobs,
        repairOrder: repairOrders,
        vehicle: vehicles,
      })
      .from(repairOrderJobs)
      .innerJoin(repairOrders, eq(repairOrderJobs.repairOrderId, repairOrders.id))
      .leftJoin(
        vehicles,
        sql`${vehicles.id} = (${repairOrderJobs.rawData}->>'vehicleId')::int`
      )
      .where(and(...conditions))
      .orderBy(desc(repairOrders.completedDate))
      .limit(limit);
    
    console.log(`Database query returned ${results.length} results`);
    if (results.length > 0) {
      console.log('First result:', {
        jobName: results[0].job.name,
        vehicleMake: results[0].vehicle?.make,
        vehicleModel: results[0].vehicle?.model,
        vehicleYear: results[0].vehicle?.year
      });
    }

    // Fetch parts for each job
    const jobsWithDetails: JobWithDetails[] = [];

    for (const row of results) {
      const job = row.job;
      const repairOrder = row.repairOrder;
      const vehicleData = row.vehicle;
      
      // Fetch parts for this job
      const partsRaw = await db
        .select()
        .from(repairOrderJobParts)
        .where(eq(repairOrderJobParts.jobId, job.id));
      
      // Extract additional part info from raw_data
      const parts = partsRaw.map(part => ({
        ...part,
        brand: (part.rawData as any)?.brand,
        partNumber: (part.rawData as any)?.partNumber,
        retail: (part.rawData as any)?.retail,
      }));

      // Use actual vehicle data from vehicles table
      const vehicle: VehicleInfo | undefined = vehicleData ? {
        id: vehicleData.id,
        make: vehicleData.make || undefined,
        model: vehicleData.model || undefined,
        year: vehicleData.year || undefined,
        engine: vehicleData.engine || undefined,
        vin: vehicleData.vin || undefined,
      } : undefined;

      // Extract labor items from job raw_data
      const jobRawData = job.rawData as any;
      const laborItems: LaborItem[] = jobRawData?.labor?.map((labor: any) => {
        const hours = parseFloat(labor.hours) || 0;
        const rate = labor.rate || 0;
        return {
          id: labor.id,
          name: labor.name,
          hours,
          rate,
          technicianId: labor.technicianId,
          laborTotal: hours * rate, // Computed per-item total
        };
      }) || [];

      // Calculate labor total from labor items (hours * rate)
      const laborTotal = laborItems.reduce((sum, item) => {
        return sum + (item.laborTotal || 0);
      }, 0);

      // Calculate parts with computed fields for frontend
      const partsWithTotals = parts.map(part => {
        const unitPrice = part.retail || part.cost || 0;
        const quantity = part.quantity || 0;
        return {
          ...part,
          unitPrice, // Add unitPrice for frontend display
          total: unitPrice * quantity, // Computed per-item total
        };
      });

      // Calculate parts total from parts (retail * quantity)
      // Use retail price for customer-facing totals, not wholesale cost
      const partsTotal = partsWithTotals.reduce((sum, part) => {
        return sum + (part.total || 0);
      }, 0);

      // Get service writer name from repair order (denormalized or from raw_data)
      const roRawData = repairOrder?.rawData as any;
      let serviceWriterName: string | undefined = 
        (repairOrder as any)?.serviceWriterName || 
        roRawData?.serviceWriterName;
      
      // If no stored name, try to extract from raw_data serviceWriterId
      if (!serviceWriterName && roRawData?.serviceWriterId) {
        // We'll look this up after fetching all results
        const writerId = roRawData.serviceWriterId;
        serviceWriterName = undefined; // Will be populated in batch
      }

      jobsWithDetails.push({
        id: job.id,
        repairOrderId: job.repairOrderId || 0,
        name: job.name || "",
        laborHours: job.laborHours || 0,
        laborCost: job.laborCost || 0,
        partsCost: job.partsCost || 0,
        status: job.status || "",
        authorized: job.authorized === 1,
        vehicle,
        laborItems,
        parts: partsWithTotals, // Use parts with computed totals
        repairOrder,
        laborTotal,
        partsTotal,
        subtotal: laborTotal + partsTotal,
        totalPrice: laborTotal + partsTotal, // Add for sidepanel display
        feeTotal: 0,
        serviceWriterName,
      });
    }

    return jobsWithDetails;
  }

  async createSearchRequest(data: InsertSearchRequest): Promise<SearchRequest> {
    const [result] = await db.insert(searchRequests).values(data).returning();
    return result;
  }

  async getJobById(id: number): Promise<JobWithDetails | null> {
    const results = await db
      .select({
        job: repairOrderJobs,
        repairOrder: repairOrders,
        vehicle: vehicles,
      })
      .from(repairOrderJobs)
      .innerJoin(repairOrders, eq(repairOrderJobs.repairOrderId, repairOrders.id))
      .leftJoin(
        vehicles,
        sql`${vehicles.id} = (${repairOrderJobs.rawData}->>'vehicleId')::int`
      )
      .where(eq(repairOrderJobs.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const row = results[0];
    const job = row.job;
    const repairOrder = row.repairOrder;
    const vehicleData = row.vehicle;
    
    const partsRaw = await db
      .select()
      .from(repairOrderJobParts)
      .where(eq(repairOrderJobParts.jobId, job.id));
    
    const parts = partsRaw.map(part => ({
      ...part,
      brand: (part.rawData as any)?.brand,
      partNumber: (part.rawData as any)?.partNumber,
      retail: (part.rawData as any)?.retail,
    }));

    const vehicle: VehicleInfo | undefined = vehicleData ? {
      id: vehicleData.id,
      make: vehicleData.make || undefined,
      model: vehicleData.model || undefined,
      year: vehicleData.year || undefined,
      engine: vehicleData.engine || undefined,
      vin: vehicleData.vin || undefined,
    } : undefined;

    const jobRawData = job.rawData as any;
    const laborItems: LaborItem[] = jobRawData?.labor?.map((labor: any) => {
      const hours = parseFloat(labor.hours) || 0;
      const rate = labor.rate || 0;
      return {
        id: labor.id,
        name: labor.name,
        hours,
        rate,
        technicianId: labor.technicianId,
        laborTotal: hours * rate, // Computed per-item total
      };
    }) || [];

    const laborTotal = laborItems.reduce((sum, item) => {
      return sum + (item.laborTotal || 0);
    }, 0);

    // Calculate parts with computed fields for frontend
    const partsWithTotals = parts.map(part => {
      const unitPrice = part.retail || part.cost || 0;
      const quantity = part.quantity || 0;
      return {
        ...part,
        unitPrice, // Add unitPrice for frontend display
        total: unitPrice * quantity, // Computed per-item total
      };
    });

    // Calculate parts total from parts (retail * quantity)
    // Use retail price for customer-facing totals, not wholesale cost
    const partsTotal = partsWithTotals.reduce((sum, part) => {
      return sum + (part.total || 0);
    }, 0);

    return {
      id: job.id,
      repairOrderId: job.repairOrderId || 0,
      name: job.name || "",
      laborHours: job.laborHours || 0,
      laborCost: job.laborCost || 0,
      partsCost: job.partsCost || 0,
      status: job.status || "",
      authorized: job.authorized === 1,
      vehicle,
      laborItems,
      parts: partsWithTotals, // Use parts with computed totals
      repairOrder,
      laborTotal,
      partsTotal,
      subtotal: laborTotal + partsTotal,
      totalPrice: laborTotal + partsTotal, // Add for sidepanel display
      feeTotal: 0,
    };
  }

  async getRepairOrderById(id: number): Promise<RepairOrder | null> {
    const results = await db.select().from(repairOrders).where(eq(repairOrders.id, id)).limit(1);
    return results.length > 0 ? results[0] : null;
  }

  async getSettings(): Promise<Settings | null> {
    const results = await db.select().from(settings).limit(1);
    return results.length > 0 ? results[0] : null;
  }

  async updateSettings(data: InsertSettings): Promise<Settings> {
    const existing = await this.getSettings();
    
    if (existing) {
      const [result] = await db
        .update(settings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(settings.id, existing.id))
        .returning();
      return result;
    } else {
      const [result] = await db.insert(settings).values(data).returning();
      return result;
    }
  }

  // Generate a consistent hash for search params
  private generateSearchHash(params: SearchJobRequest): string {
    const normalized = {
      make: params.vehicleMake?.toLowerCase().trim() || '',
      model: params.vehicleModel?.toLowerCase().trim() || '',
      year: params.vehicleYear || 0,
      engine: params.vehicleEngine?.toLowerCase().trim() || '',
      repairType: params.repairType.toLowerCase().trim(),
    };
    const key = JSON.stringify(normalized);
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  async getCachedSearch(params: SearchJobRequest): Promise<SearchResult[] | null> {
    const searchHash = this.generateSearchHash(params);
    
    const results = await db
      .select()
      .from(searchCache)
      .where(
        and(
          eq(searchCache.searchHash, searchHash),
          gte(searchCache.expiresAt, new Date())
        )
      )
      .limit(1);
    
    if (results.length === 0) {
      return null;
    }
    
    return results[0].results as SearchResult[];
  }

  async setCachedSearch(params: SearchJobRequest, results: SearchResult[]): Promise<void> {
    const searchHash = this.generateSearchHash(params);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL
    
    await db
      .insert(searchCache)
      .values({
        searchHash,
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        results: results as any,
        resultsCount: results.length,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: searchCache.searchHash,
        set: {
          results: results as any,
          resultsCount: results.length,
          createdAt: new Date(),
          expiresAt,
        },
      });
  }

  async getRecentSearches(limit: number = 10): Promise<SearchCache[]> {
    return await db
      .select()
      .from(searchCache)
      .where(gte(searchCache.expiresAt, new Date()))
      .orderBy(desc(searchCache.createdAt))
      .limit(limit);
  }

  async cleanExpiredCache(): Promise<void> {
    await db
      .delete(searchCache)
      .where(lte(searchCache.expiresAt, new Date()));
  }

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<(User & { passwordHash: string | null }) | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return user as (User & { passwordHash: string | null }) | undefined;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUserWithPassword(data: { 
    email: string; 
    passwordHash: string; 
    firstName?: string | null; 
    lastName?: string | null;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        firstName: data.firstName || null,
        lastName: data.lastName || null,
      })
      .returning();
    return user;
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // User preferences
  async getUserPreferences(userId: string): Promise<UserPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return prefs;
  }

  async upsertUserPreferences(userId: string, prefs: Partial<InsertUserPreferences>): Promise<UserPreferences> {
    const existing = await this.getUserPreferences(userId);
    
    if (existing) {
      const [result] = await db
        .update(userPreferences)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(userPreferences.userId, userId))
        .returning();
      return result;
    } else {
      const [result] = await db
        .insert(userPreferences)
        .values({ userId, ...prefs })
        .returning();
      return result;
    }
  }

  async getUserWithPreferences(userId: string): Promise<UserWithPreferences | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;
    
    const prefs = await this.getUserPreferences(userId);
    return { ...user, preferences: prefs };
  }

  // Script feedback
  async createScriptFeedback(feedback: InsertScriptFeedback): Promise<ScriptFeedback> {
    const [result] = await db
      .insert(scriptFeedback)
      .values(feedback)
      .returning();
    return result;
  }

  async getUserFeedback(userId: string, limit: number = 50): Promise<ScriptFeedback[]> {
    return await db
      .select()
      .from(scriptFeedback)
      .where(eq(scriptFeedback.userId, userId))
      .orderBy(desc(scriptFeedback.createdAt))
      .limit(limit);
  }

  async getPositiveFeedbackForUser(userId: string, scriptType?: string): Promise<ScriptFeedback[]> {
    const conditions = [
      eq(scriptFeedback.userId, userId),
      or(
        eq(scriptFeedback.sentiment, 'positive'),
        eq(scriptFeedback.outcome, 'approved')
      )
    ];
    
    if (scriptType) {
      conditions.push(eq(scriptFeedback.scriptType, scriptType));
    }
    
    return await db
      .select()
      .from(scriptFeedback)
      .where(and(...conditions))
      .orderBy(desc(scriptFeedback.createdAt))
      .limit(20);
  }

  // Admin operations
  async isUserAdmin(userId: string): Promise<boolean> {
    const prefs = await this.getUserPreferences(userId);
    return prefs?.isAdmin === true;
  }

  async getAllUsersWithPreferences(): Promise<UserWithPreferences[]> {
    const allUsers = await db
      .select()
      .from(users)
      .orderBy(users.firstName, users.lastName);
    
    const result: UserWithPreferences[] = [];
    for (const user of allUsers) {
      const prefs = await this.getUserPreferences(user.id);
      result.push({ ...user, preferences: prefs });
    }
    return result;
  }

  async updateUserTrainingAsAdmin(targetUserId: string, training: string): Promise<UserPreferences> {
    return await this.upsertUserPreferences(targetUserId, { personalTraining: training });
  }

  async createUserAsAdmin(userData: { email: string; firstName: string; lastName: string; isAdmin?: boolean; passwordHash?: string }): Promise<User> {
    // Generate a unique ID for the user
    const userId = crypto.randomUUID();
    
    // Create the user with optional password
    const [newUser] = await db
      .insert(users)
      .values({
        id: userId,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        passwordHash: userData.passwordHash || null,
      })
      .returning();
    
    // Always create user preferences for new users (auto-approve admin-created users)
    await this.upsertUserPreferences(userId, { 
      isAdmin: userData.isAdmin === true,
      approvalStatus: 'approved',
    });
    
    return newUser;
  }

  async deleteUserAsAdmin(userId: string): Promise<void> {
    // Verify user exists
    const existingUser = await this.getUser(userId);
    if (!existingUser) {
      throw new Error("User not found");
    }
    
    // Delete in a transaction: preferences first (foreign key), then user
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  async updateUserAdminStatus(userId: string, isAdmin: boolean): Promise<UserPreferences> {
    // Verify user exists
    const existingUser = await this.getUser(userId);
    if (!existingUser) {
      throw new Error("User not found");
    }
    
    // Get existing preferences - must exist to update admin status
    const existingPrefs = await this.getUserPreferences(userId);
    if (!existingPrefs) {
      // Create preferences for existing user if missing
      return await this.upsertUserPreferences(userId, { isAdmin });
    }
    
    // Update existing preferences
    return await this.upsertUserPreferences(userId, { isAdmin });
  }

  // Approval workflow methods
  async ensureUserPreferencesOnLogin(userId: string, email: string | null): Promise<UserPreferences> {
    // Auto-approve @heartautocare.com emails (case-insensitive)
    const normalizedEmail = email?.toLowerCase().trim() ?? '';
    const isHeartEmail = normalizedEmail.endsWith('@heartautocare.com');
    
    // Bootstrap admin emails - these get auto-approved AND admin access
    const bootstrapAdminEmails = [
      'brandoncrusha@gmail.com',
    ];
    const isBootstrapAdmin = bootstrapAdminEmails.includes(normalizedEmail);
    
    // Check if preferences already exist
    const existing = await this.getUserPreferences(userId);
    if (existing) {
      // If user is a bootstrap admin but not yet approved/admin, upgrade them
      if (isBootstrapAdmin && (!existing.isAdmin || existing.approvalStatus !== 'approved')) {
        return await this.upsertUserPreferences(userId, { approvalStatus: 'approved', isAdmin: true });
      }
      return existing;
    }
    
    const approvalStatus = (isHeartEmail || isBootstrapAdmin) ? 'approved' : 'pending';
    const isAdmin = isBootstrapAdmin;
    
    // Create new preferences with appropriate approval status and admin flag
    return await this.upsertUserPreferences(userId, { approvalStatus, isAdmin });
  }

  async isUserApproved(userId: string): Promise<boolean> {
    const prefs = await this.getUserPreferences(userId);
    return prefs?.approvalStatus === 'approved';
  }

  async getPendingApprovalUsers(): Promise<UserWithPreferences[]> {
    const allUsers = await db
      .select()
      .from(users)
      .innerJoin(userPreferences, eq(users.id, userPreferences.userId))
      .where(eq(userPreferences.approvalStatus, 'pending'))
      .orderBy(users.firstName, users.lastName);
    
    return allUsers.map(row => ({
      ...row.users,
      preferences: row.user_preferences,
    }));
  }

  async updateUserApprovalStatus(userId: string, status: 'approved' | 'rejected'): Promise<UserPreferences> {
    // Verify user exists
    const existingUser = await this.getUser(userId);
    if (!existingUser) {
      throw new Error("User not found");
    }
    
    return await this.upsertUserPreferences(userId, { approvalStatus: status });
  }

  // Labor rate groups (admin-managed, per-shop configuration)
  async getLaborRateGroups(shopId?: string): Promise<LaborRateGroup[]> {
    if (shopId) {
      // Get groups for specific shop OR groups that apply to all shops
      return await db
        .select()
        .from(laborRateGroups)
        .where(or(
          eq(laborRateGroups.shopId, shopId),
          eq(laborRateGroups.shopId, 'ALL')
        ))
        .orderBy(laborRateGroups.name);
    }
    
    // Get all groups (admin view)
    return await db
      .select()
      .from(laborRateGroups)
      .orderBy(laborRateGroups.shopId, laborRateGroups.name);
  }

  async createLaborRateGroup(data: InsertLaborRateGroup): Promise<LaborRateGroup> {
    const [group] = await db
      .insert(laborRateGroups)
      .values(data)
      .returning();
    return group;
  }

  async updateLaborRateGroup(id: string, data: Partial<InsertLaborRateGroup>): Promise<LaborRateGroup> {
    const [group] = await db
      .update(laborRateGroups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(laborRateGroups.id, id))
      .returning();
    
    if (!group) {
      throw new Error("Labor rate group not found");
    }
    return group;
  }

  async deleteLaborRateGroup(id: string): Promise<void> {
    await db
      .delete(laborRateGroups)
      .where(eq(laborRateGroups.id, id));
  }
  
  // RingCentral user mappings
  async getAllRingcentralUsers(): Promise<RingcentralUser[]> {
    return await db
      .select()
      .from(ringcentralUsers)
      .orderBy(ringcentralUsers.displayName);
  }

  async getRingcentralUserByExtensionId(extensionId: string): Promise<RingcentralUser | undefined> {
    const [user] = await db
      .select()
      .from(ringcentralUsers)
      .where(eq(ringcentralUsers.ringcentralExtensionId, extensionId));
    return user;
  }

  async getRingcentralUserByUserId(userId: string): Promise<RingcentralUser | undefined> {
    const [user] = await db
      .select()
      .from(ringcentralUsers)
      .where(eq(ringcentralUsers.userId, userId));
    return user;
  }

  async createRingcentralUser(data: InsertRingcentralUser): Promise<RingcentralUser> {
    const [user] = await db
      .insert(ringcentralUsers)
      .values(data)
      .returning();
    return user;
  }

  async updateRingcentralUser(id: string, data: Partial<InsertRingcentralUser>): Promise<RingcentralUser> {
    const [user] = await db
      .update(ringcentralUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ringcentralUsers.id, id))
      .returning();
    if (!user) throw new Error("RingCentral user not found");
    return user;
  }

  async deleteRingcentralUser(id: string): Promise<void> {
    await db
      .delete(ringcentralUsers)
      .where(eq(ringcentralUsers.id, id));
  }

  async upsertRingcentralUserMapping(
    extensionId: string, 
    userId: string, 
    extensionNumber: string, 
    extensionName: string
  ): Promise<RingcentralUser> {
    const existing = await this.getRingcentralUserByExtensionId(extensionId);
    
    if (existing) {
      return await this.updateRingcentralUser(existing.id.toString(), {
        userId,
        displayName: `${extensionName} (Ext ${extensionNumber})`,
      });
    } else {
      return await this.createRingcentralUser({
        ringcentralExtensionId: extensionId,
        userId,
        displayName: `${extensionName} (Ext ${extensionNumber})`,
      });
    }
  }

  // Call recordings
  async getCallRecordingByRingcentralId(callId: string): Promise<CallRecording | undefined> {
    const [recording] = await db
      .select()
      .from(callRecordings)
      .where(eq(callRecordings.ringcentralCallId, callId));
    return recording;
  }

  async getCallRecordingById(id: string): Promise<CallRecording | undefined> {
    const [recording] = await db
      .select()
      .from(callRecordings)
      .where(eq(callRecordings.id, id));
    return recording;
  }

  async createCallRecording(data: InsertCallRecording): Promise<CallRecording> {
    const [recording] = await db
      .insert(callRecordings)
      .values(data)
      .returning();
    return recording;
  }

  async updateCallRecording(id: string, data: Partial<InsertCallRecording>): Promise<CallRecording> {
    const [recording] = await db
      .update(callRecordings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callRecordings.id, id))
      .returning();
    if (!recording) throw new Error("Call recording not found");
    return recording;
  }

  async getCallRecordingsForUser(
    userId: string, 
    dateFrom?: Date, 
    dateTo?: Date, 
    limit: number = 100,
    direction?: string
  ): Promise<CallRecording[]> {
    const conditions = [eq(callRecordings.userId, userId)];
    
    if (dateFrom) {
      conditions.push(gte(callRecordings.callStartTime, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(callRecordings.callStartTime, dateTo));
    }
    if (direction) {
      conditions.push(eq(callRecordings.direction, direction));
    }
    
    return await db
      .select()
      .from(callRecordings)
      .where(and(...conditions))
      .orderBy(desc(callRecordings.callStartTime))
      .limit(limit);
  }

  async getCallRecordingsForShop(
    shopId: string, 
    dateFrom?: Date, 
    dateTo?: Date, 
    limit: number = 100,
    direction?: string
  ): Promise<CallRecording[]> {
    const conditions = [eq(callRecordings.shopId, shopId)];
    
    if (dateFrom) {
      conditions.push(gte(callRecordings.callStartTime, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(callRecordings.callStartTime, dateTo));
    }
    if (direction) {
      conditions.push(eq(callRecordings.direction, direction));
    }
    
    return await db
      .select()
      .from(callRecordings)
      .where(and(...conditions))
      .orderBy(desc(callRecordings.callStartTime))
      .limit(limit);
  }

  async getAllCallRecordings(
    dateFrom?: Date, 
    dateTo?: Date, 
    limit: number = 100,
    direction?: string
  ): Promise<CallRecording[]> {
    const conditions = [];
    
    if (dateFrom) {
      conditions.push(gte(callRecordings.callStartTime, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(callRecordings.callStartTime, dateTo));
    }
    if (direction) {
      conditions.push(eq(callRecordings.direction, direction));
    }
    
    const query = conditions.length > 0 
      ? db.select().from(callRecordings).where(and(...conditions))
      : db.select().from(callRecordings);
    
    return await query
      .orderBy(desc(callRecordings.callStartTime))
      .limit(limit);
  }

  // Coaching criteria
  async getActiveCoachingCriteria(shopId?: string): Promise<CoachingCriteria[]> {
    const conditions = [eq(coachingCriteria.isActive, true)];
    
    if (shopId) {
      conditions.push(or(
        eq(coachingCriteria.shopId, shopId),
        sql`${coachingCriteria.shopId} IS NULL`
      )!);
    }
    
    return await db
      .select()
      .from(coachingCriteria)
      .where(and(...conditions))
      .orderBy(coachingCriteria.sortOrder);
  }

  async getAllCoachingCriteria(): Promise<CoachingCriteria[]> {
    return await db
      .select()
      .from(coachingCriteria)
      .orderBy(coachingCriteria.sortOrder);
  }

  async getCoachingCriteriaById(id: string): Promise<CoachingCriteria | undefined> {
    const [criteria] = await db
      .select()
      .from(coachingCriteria)
      .where(eq(coachingCriteria.id, id));
    return criteria;
  }

  async createCoachingCriteria(data: InsertCoachingCriteria): Promise<CoachingCriteria> {
    const [criteria] = await db
      .insert(coachingCriteria)
      .values(data)
      .returning();
    return criteria;
  }

  async updateCoachingCriteria(id: string, data: Partial<InsertCoachingCriteria>): Promise<CoachingCriteria> {
    const [criteria] = await db
      .update(coachingCriteria)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(coachingCriteria.id, id))
      .returning();
    if (!criteria) throw new Error("Coaching criteria not found");
    return criteria;
  }

  async deleteCoachingCriteria(id: string): Promise<void> {
    await db
      .delete(coachingCriteria)
      .where(eq(coachingCriteria.id, id));
  }

  // Call scores
  async getCallScore(callId: string): Promise<CallScore | undefined> {
    const [score] = await db
      .select()
      .from(callScores)
      .where(eq(callScores.callId, callId));
    return score;
  }

  async createCallScore(data: InsertCallScore): Promise<CallScore> {
    const [score] = await db
      .insert(callScores)
      .values(data)
      .returning();
    return score;
  }

  async updateCallScore(id: string, data: Partial<InsertCallScore>): Promise<CallScore> {
    const [score] = await db
      .update(callScores)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(callScores.id, id))
      .returning();
    if (!score) throw new Error("Call score not found");
    return score;
  }
}

export const storage: IStorage = new DatabaseStorage();
