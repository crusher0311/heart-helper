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
} from "@shared/schema";
import { db } from "./db";
import { repairOrders, repairOrderJobs, repairOrderJobParts, searchRequests, vehicles, settings } from "@shared/schema";
import { eq, and, or, like, ilike, sql, desc, gte, lte } from "drizzle-orm";

export interface IStorage {
  // Search jobs based on criteria
  searchJobs(params: SearchJobRequest & { yearRange?: number }): Promise<JobWithDetails[]>;
  
  // Get a single job by ID
  getJobById(id: number): Promise<JobWithDetails | null>;
  
  // Create search request log
  createSearchRequest(data: InsertSearchRequest): Promise<SearchRequest>;
  
  // Settings
  getSettings(): Promise<Settings | null>;
  updateSettings(data: InsertSettings): Promise<Settings>;
}

export class DatabaseStorage implements IStorage {
  
  async searchJobs(params: {
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    vehicleEngine?: string;
    repairType: string;
    limit?: number;
    yearRange?: number;
  }): Promise<JobWithDetails[]> {
    const limit = params.limit || 50;

    // Build the query conditions
    const conditions = [];

    // Search repair type in job name (broad search, case-insensitive)
    conditions.push(
      ilike(repairOrderJobs.name, `%${params.repairType}%`)
    );

    // Add vehicle filters if provided
    if (params.vehicleMake) {
      conditions.push(ilike(vehicles.make, `%${params.vehicleMake}%`));
    }

    if (params.vehicleModel) {
      conditions.push(ilike(vehicles.model, `%${params.vehicleModel}%`));
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
      conditions.push(ilike(vehicles.engine, `%${params.vehicleEngine}%`));
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

      // Calculate parts total from parts (cost * quantity)
      const partsTotal = parts.reduce((sum, part) => {
        return sum + ((part.cost || 0) * (part.quantity || 0));
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

    const partsTotal = parts.reduce((sum, part) => {
      return sum + ((part.cost || 0) * (part.quantity || 0));
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
}

export const storage: IStorage = new DatabaseStorage();
