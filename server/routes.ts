import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scoreJobMatches } from "./ai";
import { importRepairOrder, importVehicle } from "./import";
import { searchJobSchema, type SearchResult } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Data import endpoints for Tekmetric data
  app.post("/api/import/repair-order", importRepairOrder);
  app.post("/api/import/vehicle", importVehicle);

  // Search endpoint - AI-powered job matching
  app.post("/api/search", async (req, res) => {
    try {
      const params = searchJobSchema.parse(req.body);

      // Search database for candidate jobs
      const candidates = await storage.searchJobs({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        repairType: params.repairType,
        limit: params.limit,
      });

      if (candidates.length === 0) {
        return res.json([]);
      }

      // Prepare candidates for AI scoring
      const candidatesForAI = candidates.map((job) => ({
        id: job.id,
        name: job.name,
        vehicleMake: job.vehicle?.make,
        vehicleModel: job.vehicle?.model,
        vehicleYear: job.vehicle?.year,
        vehicleEngine: job.vehicle?.engine,
        jobCategory: job.jobCategoryName || undefined,
        laborHours: job.laborHours?.toString(),
        partsCount: job.parts.length,
        totalCost: job.subtotal,
      }));

      // Use AI to score and rank matches
      const matches = await scoreJobMatches(
        {
          vehicleMake: params.vehicleMake,
          vehicleModel: params.vehicleModel,
          vehicleYear: params.vehicleYear,
          vehicleEngine: params.vehicleEngine,
          repairType: params.repairType,
        },
        candidatesForAI
      );

      // Combine AI scores with job data
      const results: SearchResult[] = matches
        .map((match) => {
          const job = candidates.find((c) => c.id === match.jobId);
          if (!job) return null;

          return {
            job,
            matchScore: match.matchScore,
            matchReason: match.matchReason,
          };
        })
        .filter((r): r is SearchResult => r !== null);

      // Log search request
      await storage.createSearchRequest({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        resultsCount: results.length,
      });

      res.json(results);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Get job details endpoint
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await storage.getJobWithDetails(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Get job error:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
