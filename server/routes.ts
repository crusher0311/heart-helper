import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { searchJobSchema, type SearchResult } from "@shared/schema";
import { scoreJobMatches, getCompatibleYears } from "./ai";
import archiver from "archiver";
import { join } from "path";

export function registerRoutes(app: Express) {
  // Search endpoint
  app.post("/api/search", async (req, res) => {
    try {
      const params = searchJobSchema.parse(req.body);

      // Get candidate jobs from database - try exact match first
      let candidates = await storage.searchJobs({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        limit: 50,
      });

      // If no results and year was specified, use AI to find compatible model years
      if (candidates.length === 0 && params.vehicleYear && params.vehicleMake && params.vehicleModel) {
        console.log(`No exact year matches for ${params.vehicleYear}, using AI to find compatible years...`);
        
        // Get AI-determined compatible years
        const compatibleYears = await getCompatibleYears(
          params.vehicleMake,
          params.vehicleModel,
          params.vehicleYear,
          params.vehicleEngine,
          params.repairType
        );
        
        // Search again with broader year criteria, but no specific yearRange
        // We'll filter by compatible years after the query
        candidates = await storage.searchJobs({
          vehicleMake: params.vehicleMake,
          vehicleModel: params.vehicleModel,
          vehicleEngine: params.vehicleEngine,
          repairType: params.repairType,
          limit: 100, // Get more candidates since we'll filter
        });
        
        // Filter candidates to only include compatible years
        candidates = candidates.filter(job => 
          job.vehicle?.year && compatibleYears.includes(job.vehicle.year)
        ).slice(0, 50); // Limit to top 50
      }

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

        // Combine AI scores with job data
        results = matches
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
      } catch (aiError) {
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

  // Download Chrome extension endpoint
  app.get("/api/download-extension", (req, res) => {
    try {
      const extensionPath = join(process.cwd(), "chrome-extension");
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=tekmetric-job-importer.zip');

      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      archive.on('error', (err) => {
        console.error('Archive error:', err);
        res.status(500).send('Error creating extension archive');
      });

      archive.pipe(res);

      archive.directory(extensionPath, 'tekmetric-job-importer');

      archive.finalize();
      
      console.log('Extension download started');
    } catch (error: any) {
      console.error("Extension download error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
