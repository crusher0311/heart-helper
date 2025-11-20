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
      console.log("🔍 Search request:", JSON.stringify(params, null, 2));

      // Get candidate jobs from database
      const candidates = await storage.searchJobs({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        limit: 50,
      });

      console.log(`✅ Found ${candidates.length} candidate jobs`);
      
      if (candidates.length === 0) {
        console.log("❌ No candidates found, returning empty results");
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

      // Try AI scoring, but fall back to simple results if it fails
      let results: SearchResult[];
      
      try {
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

        console.log(`🤖 AI returned ${matches.length} scored matches`);

        // Combine AI scores with job data
        results = matches
          .map((match) => {
            const job = candidates.find((c) => c.id === match.jobId);
            if (!job) {
              console.log(`⚠️  AI returned jobId ${match.jobId} but not found in candidates`);
              return null;
            }

            return {
              job,
              matchScore: match.matchScore,
              matchReason: match.matchReason,
            };
          })
          .filter((r): r is SearchResult => r !== null);
        
        console.log(`📊 Final results after matching: ${results.length}`);
      } catch (aiError) {
        console.log("AI scoring unavailable, returning unscored results:", aiError);
        // Return results without AI scoring
        results = candidates.slice(0, 20).map((job) => ({
          job,
          matchScore: 85,
          matchReason: "Match based on repair type (AI scoring unavailable)",
        }));
      }

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
