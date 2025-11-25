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
} from "@shared/schema";
import { db } from "./db";
import { repairOrders, repairOrderJobs, repairOrderJobParts, searchRequests, vehicles, settings, searchCache } from "@shared/schema";
import { eq, and, or, like, ilike, sql, desc, gte, lte } from "drizzle-orm";
import crypto from "crypto";

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
      // Smart model matching: extract base model name and match flexibly
      // "4Runner TRD Pro" should match "4Runner"
      // "Camry SE" should match "Camry"
      const modelWords = params.vehicleModel.split(/\s+/).filter(w => w.length > 0);
      const baseModel = modelWords[0]; // First word is usually the model name
      
      if (modelWords.length > 1) {
        // If multiple words, try to match either the full string OR the base model
        conditions.push(
          or(
            ilike(vehicles.model, `%${params.vehicleModel}%`),
            ilike(vehicles.model, `%${baseModel}%`)
          )
        );
        console.log(`Model matching: "${params.vehicleModel}" OR base model "${baseModel}"`);
      } else {
        conditions.push(ilike(vehicles.model, `%${params.vehicleModel}%`));
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
      const laborItems: LaborItem[] = jobRawData?.labor?.map((labor: any) => ({
        id: labor.id,
        name: labor.name,
        hours: parseFloat(labor.hours) || 0,
        rate: labor.rate || 0,
        technicianId: labor.technicianId,
      })) || [];

      // Calculate labor total from labor items (hours * rate)
      const laborTotal = laborItems.reduce((sum, item) => {
        return sum + (item.hours * item.rate);
      }, 0);

      // Calculate parts total from parts (retail * quantity)
      // Use retail price for customer-facing totals, not wholesale cost
      const partsTotal = parts.reduce((sum, part) => {
        return sum + ((part.retail || part.cost || 0) * (part.quantity || 0));
      }, 0);

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
        parts,
        repairOrder,
        laborTotal,
        partsTotal,
        subtotal: laborTotal + partsTotal,
        feeTotal: 0,
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
    const laborItems: LaborItem[] = jobRawData?.labor?.map((labor: any) => ({
      id: labor.id,
      name: labor.name,
      hours: parseFloat(labor.hours) || 0,
      rate: labor.rate || 0,
      technicianId: labor.technicianId,
    })) || [];

    const laborTotal = laborItems.reduce((sum, item) => {
      return sum + (item.hours * item.rate);
    }, 0);

    // Calculate parts total from parts (retail * quantity)
    // Use retail price for customer-facing totals, not wholesale cost
    const partsTotal = parts.reduce((sum, part) => {
      return sum + ((part.retail || part.cost || 0) * (part.quantity || 0));
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
      parts,
      repairOrder,
      laborTotal,
      partsTotal,
      subtotal: laborTotal + partsTotal,
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
}

export const storage: IStorage = new DatabaseStorage();
