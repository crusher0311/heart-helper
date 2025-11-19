// Reference: javascript_database blueprint
import {
  vehicles,
  repairOrders,
  jobs,
  laborItems,
  parts,
  searchRequests,
  type Vehicle,
  type InsertVehicle,
  type RepairOrder,
  type InsertRepairOrder,
  type Job,
  type InsertJob,
  type LaborItem,
  type InsertLaborItem,
  type Part,
  type InsertPart,
  type JobWithDetails,
  type SearchRequest,
  type InsertSearchRequest,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, like, ilike, sql, desc } from "drizzle-orm";

export interface IStorage {
  // Vehicles
  getVehicle(id: number): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  
  // Repair Orders
  getRepairOrder(id: number): Promise<RepairOrder | undefined>;
  createRepairOrder(order: InsertRepairOrder): Promise<RepairOrder>;
  
  // Jobs
  getJob(id: number): Promise<Job | undefined>;
  getJobWithDetails(id: number): Promise<JobWithDetails | undefined>;
  searchJobs(params: {
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    repairType: string;
    limit?: number;
  }): Promise<JobWithDetails[]>;
  createJob(job: InsertJob): Promise<Job>;
  
  // Labor Items
  createLaborItem(item: InsertLaborItem): Promise<LaborItem>;
  getLaborItemsByJobId(jobId: number): Promise<LaborItem[]>;
  
  // Parts
  createPart(part: InsertPart): Promise<Part>;
  getPartsByJobId(jobId: number): Promise<Part[]>;
  
  // Search Requests
  createSearchRequest(request: InsertSearchRequest): Promise<SearchRequest>;
}

export class DatabaseStorage implements IStorage {
  // Vehicles
  async getVehicle(id: number): Promise<Vehicle | undefined> {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return vehicle || undefined;
  }

  async createVehicle(insertVehicle: InsertVehicle): Promise<Vehicle> {
    const [vehicle] = await db
      .insert(vehicles)
      .values(insertVehicle)
      .returning();
    return vehicle;
  }

  // Repair Orders
  async getRepairOrder(id: number): Promise<RepairOrder | undefined> {
    const [order] = await db.select().from(repairOrders).where(eq(repairOrders.id, id));
    return order || undefined;
  }

  async createRepairOrder(insertOrder: InsertRepairOrder): Promise<RepairOrder> {
    const [order] = await db
      .insert(repairOrders)
      .values(insertOrder)
      .returning();
    return order;
  }

  // Jobs
  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getJobWithDetails(id: number): Promise<JobWithDetails | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    if (!job) return undefined;

    const [vehicle] = job.vehicleId
      ? await db.select().from(vehicles).where(eq(vehicles.id, job.vehicleId))
      : [undefined];

    const [repairOrder] = job.repairOrderId
      ? await db.select().from(repairOrders).where(eq(repairOrders.id, job.repairOrderId))
      : [undefined];

    const laborItemsList = await db.select().from(laborItems).where(eq(laborItems.jobId, id));
    const partsList = await db.select().from(parts).where(eq(parts.jobId, id));

    return {
      ...job,
      vehicle,
      repairOrder,
      laborItems: laborItemsList,
      parts: partsList,
    };
  }

  async searchJobs(params: {
    vehicleMake?: string;
    vehicleModel?: string;
    vehicleYear?: number;
    repairType: string;
    limit?: number;
  }): Promise<JobWithDetails[]> {
    const limit = params.limit || 50;

    // Build the query conditions
    const conditions = [];

    // Search repair type in job name (broad search, case-insensitive)
    conditions.push(
      or(
        ilike(jobs.name, `%${params.repairType}%`),
        ilike(jobs.jobCategoryName, `%${params.repairType}%`)
      )
    );

    // Execute base query
    let query = db
      .select()
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.createdDate))
      .limit(limit);

    const jobsList = await query;

    // Enrich with related data
    const enrichedJobs: JobWithDetails[] = await Promise.all(
      jobsList.map(async (job) => {
        const [vehicle] = job.vehicleId
          ? await db.select().from(vehicles).where(eq(vehicles.id, job.vehicleId))
          : [undefined];

        const [repairOrder] = job.repairOrderId
          ? await db.select().from(repairOrders).where(eq(repairOrders.id, job.repairOrderId))
          : [undefined];

        const laborItemsList = await db.select().from(laborItems).where(eq(laborItems.jobId, job.id));
        const partsList = await db.select().from(parts).where(eq(parts.jobId, job.id));

        return {
          ...job,
          vehicle,
          repairOrder,
          laborItems: laborItemsList,
          parts: partsList,
        };
      })
    );

    // Filter by vehicle criteria if provided (post-query filtering for more flexibility)
    let filtered = enrichedJobs;

    if (params.vehicleMake) {
      filtered = filtered.filter(
        (j) => j.vehicle?.make?.toLowerCase().includes(params.vehicleMake!.toLowerCase())
      );
    }

    if (params.vehicleModel) {
      filtered = filtered.filter(
        (j) => j.vehicle?.model?.toLowerCase().includes(params.vehicleModel!.toLowerCase())
      );
    }

    if (params.vehicleYear) {
      // Allow +/- 2 years for flexibility
      filtered = filtered.filter(
        (j) => j.vehicle?.year && Math.abs(j.vehicle.year - params.vehicleYear!) <= 2
      );
    }

    return filtered;
  }

  async createJob(insertJob: InsertJob): Promise<Job> {
    const [job] = await db
      .insert(jobs)
      .values(insertJob)
      .returning();
    return job;
  }

  // Labor Items
  async createLaborItem(insertItem: InsertLaborItem): Promise<LaborItem> {
    const [item] = await db
      .insert(laborItems)
      .values(insertItem)
      .returning();
    return item;
  }

  async getLaborItemsByJobId(jobId: number): Promise<LaborItem[]> {
    return db.select().from(laborItems).where(eq(laborItems.jobId, jobId));
  }

  // Parts
  async createPart(insertPart: InsertPart): Promise<Part> {
    const [part] = await db
      .insert(parts)
      .values(insertPart)
      .returning();
    return part;
  }

  async getPartsByJobId(jobId: number): Promise<Part[]> {
    return db.select().from(parts).where(eq(parts.jobId, jobId));
  }

  // Search Requests
  async createSearchRequest(insertRequest: InsertSearchRequest): Promise<SearchRequest> {
    const [request] = await db
      .insert(searchRequests)
      .values(insertRequest)
      .returning();
    return request;
  }
}

export const storage = new DatabaseStorage();
