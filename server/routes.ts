import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { searchJobSchema, type SearchResult } from "@shared/schema";
import { scoreJobMatches } from "./ai";

export function registerRoutes(app: Express) {
  // Search endpoint
  app.post("/api/search", async (req, res) => {
    try {
      const params = searchJobSchema.parse(req.body);

      // Get candidate jobs from database
      const candidates = await storage.searchJobs({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        limit: 50,
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

  const httpServer = createServer(app);

  return httpServer;
}
