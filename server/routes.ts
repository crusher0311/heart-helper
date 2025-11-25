import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { searchJobSchema, type SearchResult, insertSettingsSchema } from "@shared/schema";
import { scoreJobMatches, getCompatibleYears } from "./ai";
import archiver from "archiver";
import { join } from "path";
import { 
  createTekmetricEstimate, 
  testConnection, 
  fetchCurrentPricing,
  isTekmetricConfigured,
  getAvailableShops,
  SHOP_NAMES,
  type ShopLocation
} from "./tekmetric";
import { z } from "zod";

export function registerRoutes(app: Express) {
  // Search endpoint
  app.post("/api/search", async (req, res) => {
    try {
      const params = searchJobSchema.parse(req.body);
      
      // Strip common trim levels from model name for better matching
      const trimLevels = /\s+(XLE|LE|SE|XSE|Limited|Sport|Premium|Touring|EX|LX|DX|SV|SL|SR|Platinum|Denali|LTZ|LT|LS|L|S|High Country|King Ranch|Lariat|STX|Big Horn|Laramie|Rebel|TRD|Off-Road|Trail|Base|Value|Classic|Work Truck|WT)$/i;
      if (params.vehicleModel) {
        params.vehicleModel = params.vehicleModel.replace(trimLevels, '').trim();
      }

      // Get candidate jobs from database - try exact match first
      let candidates = await storage.searchJobs({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        limit: 50,
      });

      // If no results and year was specified, try expanding year range by ±2 years
      // TODO: Re-enable AI year compatibility once token issue is resolved
      if (candidates.length === 0 && params.vehicleYear && params.vehicleMake && params.vehicleModel) {
        console.log(`No exact year matches for ${params.vehicleYear}, trying ±2 year range...`);
        
        // Simple fallback: ±2 years
        const compatibleYears = [
          params.vehicleYear - 2,
          params.vehicleYear - 1,
          params.vehicleYear,
          params.vehicleYear + 1,
          params.vehicleYear + 2
        ];
        
        // Search again with broader year criteria
        // Drop the engine filter to avoid format mismatches
        console.log(`Searching for: make=${params.vehicleMake}, model=${params.vehicleModel}, repair=${params.repairType}`);
        
        candidates = await storage.searchJobs({
          vehicleMake: params.vehicleMake,
          vehicleModel: params.vehicleModel,
          repairType: params.repairType,
          limit: 100, // Get more candidates since we'll filter
        });
        
        console.log(`Raw search found ${candidates.length} candidates before year filter`);
        
        // Filter candidates to only include compatible years
        candidates = candidates.filter(job => 
          job.vehicle?.year && compatibleYears.includes(job.vehicle.year)
        ).slice(0, 50); // Limit to top 50
        
        console.log(`Found ${candidates.length} candidates in years ${compatibleYears.join(', ')}`);
      }

      if (candidates.length === 0) {
        return res.json([]);
      }

      // Deduplicate by RO# - only show one job per repair order
      // Users want to see different repair orders, not multiple jobs from same RO
      const seenROs = new Set<number>();
      const uniqueCandidates = candidates.filter(job => {
        if (!job.repairOrderId || seenROs.has(job.repairOrderId)) {
          return false;
        }
        seenROs.add(job.repairOrderId);
        return true;
      });
      
      console.log(`Deduplicated ${candidates.length} candidates to ${uniqueCandidates.length} unique repair orders`);

      // Limit to top 30 candidates for AI scoring to improve performance (40s → ~10-15s)
      const candidatesForScoring = uniqueCandidates.slice(0, 30);
      
      if (candidatesForScoring.length < uniqueCandidates.length) {
        console.log(`Limited AI scoring to top ${candidatesForScoring.length} of ${uniqueCandidates.length} candidates for performance`);
      }

      // Prepare candidates for AI scoring
      const candidatesForAI = candidatesForScoring.map((job) => ({
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
            const job = candidatesForScoring.find((c) => c.id === match.jobId);
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
        results = candidatesForScoring.slice(0, 20).map((job) => ({
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

  // Get Tekmetric RO URL endpoint
  app.get("/api/tekmetric/ro-url/:roId", async (req, res) => {
    try {
      const roId = parseInt(req.params.roId);
      if (isNaN(roId)) {
        return res.status(400).json({ error: "Invalid RO ID" });
      }

      // Fetch RO from database to get shop location
      const ro = await storage.getRepairOrderById(roId);
      if (!ro) {
        return res.status(404).json({ error: "Repair order not found" });
      }

      const shopLocation = ro.shopId as ShopLocation;
      const shopNumericId = {
        "NB": process.env.TM_SHOP_ID_NB || "469",
        "WM": process.env.TM_SHOP_ID_WM || "469",
        "EV": process.env.TM_SHOP_ID_EV || "469",
      }[shopLocation] || "469";

      const url = `https://shop.tekmetric.com/admin/shop/${shopNumericId}/repair-orders/${roId}/estimate`;
      
      res.json({ url, shopLocation, shopName: SHOP_NAMES[shopLocation] });
    } catch (error) {
      console.error("Error getting RO URL:", error);
      res.status(500).json({ error: "Failed to get RO URL" });
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

  // Get Tekmetric configuration status
  app.get("/api/tekmetric/status", (req, res) => {
    const configured = isTekmetricConfigured();
    const availableShops = getAvailableShops();
    
    res.json({
      configured,
      availableShops: availableShops.map(shop => ({
        id: shop,
        name: SHOP_NAMES[shop],
      })),
    });
  });

  // Test Tekmetric connection for a specific shop
  app.post("/api/tekmetric/test", async (req, res) => {
    try {
      const { shopLocation } = z.object({ shopLocation: z.enum(["NB", "WM", "EV"]) }).parse(req.body);
      const success = await testConnection(shopLocation);
      res.json({ success });
    } catch (error: any) {
      console.error("Tekmetric connection test error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Create Tekmetric estimate from job
  app.post("/api/tekmetric/create-estimate", async (req, res) => {
    try {
      const schema = z.object({
        jobId: z.number(),
        shopLocation: z.enum(["NB", "WM", "EV"]),
        customerId: z.number().optional(),
        vehicleId: z.number().optional(),
        repairOrderId: z.string().optional(),
      });
      
      const { jobId, shopLocation, customerId, vehicleId, repairOrderId } = schema.parse(req.body);
      
      const job = await storage.getJobById(jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const result = await createTekmetricEstimate(job, shopLocation, customerId, vehicleId, repairOrderId);
      res.json(result);
    } catch (error: any) {
      console.error("Create estimate error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh pricing for parts
  app.post("/api/tekmetric/refresh-pricing", async (req, res) => {
    try {
      const schema = z.object({
        partNumbers: z.array(z.string()),
        shopLocation: z.enum(["NB", "WM", "EV"]),
      });
      
      const { partNumbers, shopLocation } = schema.parse(req.body);
      const pricing = await fetchCurrentPricing(partNumbers, shopLocation);
      res.json(pricing);
    } catch (error: any) {
      console.error("Refresh pricing error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get settings
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error: any) {
      console.error("Get settings error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update settings
  app.post("/api/settings", async (req, res) => {
    try {
      const data = insertSettingsSchema.parse(req.body);
      const settings = await storage.updateSettings(data);
      res.json(settings);
    } catch (error: any) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
