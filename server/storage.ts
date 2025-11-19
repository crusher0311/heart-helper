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
} from "@shared/schema";
import { db } from "./db";
import { repairOrders, repairOrderJobs, repairOrderJobParts, searchRequests } from "@shared/schema";
import { eq, and, or, like, ilike, sql, desc } from "drizzle-orm";

export interface IStorage {
  // Search jobs based on criteria
  searchJobs(params: SearchJobRequest): Promise<JobWithDetails[]>;
  
  // Create search request log
  createSearchRequest(data: InsertSearchRequest): Promise<SearchRequest>;
}

export class DatabaseStorage implements IStorage {
  
  async searchJobs(params: {
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    vehicleEngine?: string;
    repairType: string;
    limit?: number;
  }): Promise<JobWithDetails[]> {
    const limit = params.limit || 50;

    // Build the query conditions
    const conditions = [];

    // Search repair type in job name (broad search, case-insensitive)
    conditions.push(
      ilike(repairOrderJobs.name, `%${params.repairType}%`)
    );

    // NOTE: Vehicle filtering disabled - vehicle data not in database
    // Vehicle details (make/model/year/engine) are NOT stored in repair_orders.raw_data
    // Only vehicleId references exist. To enable vehicle filtering:
    // 1. Create a vehicles table
    // 2. Sync vehicle data from Tekmetric
    // 3. Join against vehicles table
    // For now, search is repair-type only which still returns relevant results

    // Execute base query joining jobs with repair orders
    let query = db
      .select()
      .from(repairOrderJobs)
      .innerJoin(repairOrders, eq(repairOrderJobs.repairOrderId, repairOrders.id))
      .where(and(...conditions))
      .orderBy(desc(repairOrders.completedDate))
      .limit(limit);

    const results = await query;

    // Fetch parts for each job
    const jobsWithDetails: JobWithDetails[] = [];

    for (const row of results) {
      const job = row.repair_order_jobs;
      const repairOrder = row.repair_orders;
      
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

      // Extract vehicle info from repair order raw_data
      const rawData = repairOrder.rawData as any;
      const vehicle: VehicleInfo | undefined = rawData ? {
        id: rawData.vehicleId,
        make: rawData.vehicleMake,
        model: rawData.vehicleModel,
        year: rawData.vehicleYear ? parseInt(rawData.vehicleYear) : undefined,
        engine: rawData.vehicleEngine,
        vin: rawData.vin,
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

      jobsWithDetails.push({
        id: job.id,
        repairOrderId: job.repairOrderId,
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
        subtotal: (job.laborCost || 0) + (job.partsCost || 0),
      });
    }

    return jobsWithDetails;
  }

  async createSearchRequest(data: InsertSearchRequest): Promise<SearchRequest> {
    const [result] = await db.insert(searchRequests).values(data).returning();
    return result;
  }
}

export const storage: IStorage = new DatabaseStorage();
