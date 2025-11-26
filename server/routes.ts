import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { 
  searchJobSchema, 
  type SearchResult, 
  insertSettingsSchema,
  generateConcernQuestionsRequestSchema,
  reviewConcernConversationRequestSchema,
  cleanConversationRequestSchema,
} from "@shared/schema";
import { 
  scoreJobMatches, 
  getCompatibleYears, 
  getSimilarModels, 
  extractRepairTerms,
  generateConcernFollowUpQuestions,
  reviewConcernConversation,
  cleanConcernConversation,
  generateSalesScript,
} from "./ai";
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
      const bypassCache = req.body.bypassCache === true;
      
      // Strip common trim levels from model name for better matching
      const trimLevels = /\s+(XLE|LE|SE|XSE|Limited|Sport|Premium|Touring|EX|LX|DX|SV|SL|SR|Platinum|Denali|LTZ|LT|LS|L|S|High Country|King Ranch|Lariat|STX|Big Horn|Laramie|Rebel|TRD|Off-Road|Trail|Base|Value|Classic|Work Truck|WT)$/i;
      if (params.vehicleModel) {
        params.vehicleModel = params.vehicleModel.replace(trimLevels, '').trim();
      }

      // Check cache first (unless bypass requested)
      if (!bypassCache) {
        const cachedResults = await storage.getCachedSearch(params);
        if (cachedResults) {
          console.log(`Cache hit! Returning ${cachedResults.length} cached results`);
          return res.json({
            results: cachedResults,
            cached: true,
            cachedAt: new Date().toISOString(),
          });
        }
        console.log('Cache miss, running fresh search...');
      } else {
        console.log('Cache bypass requested, running fresh search...');
      }

      // Extract searchable repair terms using AI for smarter matching
      // Example: "Rear Suspension/Shocks leaking" → ["rear shocks", "shock absorber", "suspension"]
      let searchTerms: string[] | undefined;
      try {
        searchTerms = await extractRepairTerms(params.repairType);
        console.log(`AI extracted ${searchTerms.length} search terms from "${params.repairType}"`);
      } catch (error) {
        console.log('AI term extraction failed, using exact repair type:', error);
        searchTerms = undefined; // Will fall back to exact match
      }

      // Initial search strategy: use ±2 year range by default for better results
      // Many repair jobs work across multiple model years (e.g., 2016-2018 share same parts)
      // This prevents "0 results" when exact year doesn't match but compatible years exist
      let candidates = await storage.searchJobs({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        searchTerms, // AI-extracted terms for smarter database search
        yearRange: params.vehicleYear ? 2 : undefined, // ±2 years if year specified
        limit: 50,
      });

      // Only apply broadening if exact match returned zero results
      if (candidates.length === 0) {
        if (params.broadenStrategy === 'years' && params.vehicleYear && params.vehicleMake && params.vehicleModel) {
          // Stage 1: Broaden year ranges using AI
          console.log(`Broadening year range for ${params.vehicleYear} ${params.vehicleMake} ${params.vehicleModel} using AI...`);
          
          const compatibleYears = await getCompatibleYears(
            params.vehicleMake,
            params.vehicleModel,
            params.vehicleYear,
            params.vehicleEngine || undefined,
            params.repairType
          );
          
          console.log(`AI determined compatible years: ${compatibleYears.join(', ')}`);
          
          // Search with broader year criteria (drop engine filter)
          const yearCandidates = await storage.searchJobs({
            vehicleMake: params.vehicleMake,
            vehicleModel: params.vehicleModel,
            repairType: params.repairType,
            searchTerms, // Use AI-extracted terms
            limit: 100,
          });
          
          // Filter to only AI-compatible years
          candidates = yearCandidates.filter(job => 
            job.vehicle?.year && compatibleYears.includes(job.vehicle.year)
          ).slice(0, 50);
          
          console.log(`Found ${candidates.length} candidates in AI-compatible years`);
          
          // Fallback if AI years produced zero results
          if (candidates.length === 0) {
            console.log('AI year expansion found no results, falling back to removing year filter...');
            candidates = await storage.searchJobs({
              vehicleMake: params.vehicleMake,
              vehicleModel: params.vehicleModel,
              repairType: params.repairType,
              searchTerms, // Use AI-extracted terms
              limit: 50,
            });
          }
          
        } else if (params.broadenStrategy === 'models' && params.vehicleMake && params.vehicleModel) {
          // Stage 2: Find similar models using AI
          console.log(`Finding similar models to ${params.vehicleMake} ${params.vehicleModel} using AI...`);
          
          const similarModels = await getSimilarModels(
            params.vehicleMake,
            params.vehicleModel,
            params.vehicleYear || undefined
          );
          
          console.log(`AI found ${similarModels.length} similar models`);
          
          if (similarModels.length > 0) {
            // Search across AI-recommended similar models
            const searchPromises = similarModels.map(({ make, model }) =>
              storage.searchJobs({
                vehicleMake: make,
                vehicleModel: model,
                repairType: params.repairType,
                searchTerms, // Use AI-extracted terms
                limit: 20,
              })
            );
            
            // Also include original vehicle
            searchPromises.push(storage.searchJobs({
              vehicleMake: params.vehicleMake,
              vehicleModel: params.vehicleModel,
              repairType: params.repairType,
              searchTerms, // Use AI-extracted terms
              limit: 20,
            }));
            
            const resultsArrays = await Promise.all(searchPromises);
            candidates = resultsArrays.flat().slice(0, 50);
            
            console.log(`Found ${candidates.length} candidates across similar models`);
          }
          
          // Only fall back to all vehicles if similar models search also failed
          if (candidates.length === 0) {
            console.log('Similar models search found no results, falling back to all vehicles...');
            candidates = await storage.searchJobs({
              repairType: params.repairType,
              searchTerms, // Use AI-extracted terms
              limit: 50,
            });
          }
          
        } else if (params.broadenStrategy === 'all') {
          // Stage 3: Remove all vehicle filters
          console.log(`Broadening to all vehicles for repair type: ${params.repairType}`);
          
          candidates = await storage.searchJobs({
            repairType: params.repairType,
            searchTerms, // Use AI-extracted terms
            limit: 50,
          });
          
          console.log(`Found ${candidates.length} candidates across all vehicles`);
        }
      } else {
        console.log(`Exact match found ${candidates.length} candidates, skipping broadening`);
      }

      if (candidates.length === 0) {
        return res.json({
          results: [],
          cached: false,
          cachedAt: new Date().toISOString(),
        });
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

      // Limit to top 20 candidates for AI scoring to improve performance
      // Using gpt-4o-mini + 20 candidates = ~8-12 second response time
      const candidatesForScoring = uniqueCandidates.slice(0, 20);
      
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
            vehicleMake: params.vehicleMake || undefined,
            vehicleModel: params.vehicleModel || undefined,
            vehicleYear: params.vehicleYear || undefined,
            vehicleEngine: params.vehicleEngine || undefined,
            repairType: params.repairType,
          },
          candidatesForAI
        );

        console.log(`AI returned ${matches.length} scored matches`);

        // Combine AI scores with job data
        results = matches
          .map((match) => {
            const job = candidatesForScoring.find((c) => c.id === match.jobId);
            if (!job) {
              console.warn(`AI returned jobId ${match.jobId} but not found in candidates`);
              return null;
            }

            return {
              job,
              matchScore: match.matchScore,
              matchReason: match.matchReason,
            };
          })
          .filter((r): r is SearchResult => r !== null);
        
        console.log(`Returning ${results.length} results to frontend`);
      } catch (aiError) {
        // Return results without AI scoring
        results = candidatesForScoring.slice(0, 20).map((job) => ({
          job,
          matchScore: 85,
          matchReason: "Match based on repair type (AI scoring unavailable)",
        }));
      }

      // Cache results for future use (1 hour TTL)
      await storage.setCachedSearch(params, results);
      console.log(`Cached ${results.length} results for future searches`);

      // Log search request
      await storage.createSearchRequest({
        vehicleMake: params.vehicleMake,
        vehicleModel: params.vehicleModel,
        vehicleYear: params.vehicleYear,
        vehicleEngine: params.vehicleEngine,
        repairType: params.repairType,
        resultsCount: results.length,
      });

      res.json({
        results,
        cached: false,
        cachedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Get recent searches endpoint
  app.get("/api/search/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const recentSearches = await storage.getRecentSearches(limit);
      
      // Map to simpler format for frontend
      const searches = recentSearches.map(search => ({
        vehicleMake: search.vehicleMake,
        vehicleModel: search.vehicleModel,
        vehicleYear: search.vehicleYear,
        vehicleEngine: search.vehicleEngine,
        repairType: search.repairType,
        resultsCount: search.resultsCount,
        createdAt: search.createdAt,
      }));
      
      res.json(searches);
    } catch (error) {
      console.error("Error fetching recent searches:", error);
      res.status(500).json({ error: "Failed to fetch recent searches" });
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
      const parseResult = insertSettingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parseResult.error.issues 
        });
      }
      const settings = await storage.updateSettings(parseResult.data);
      res.json(settings);
    } catch (error: any) {
      console.error("Update settings error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // Concern Intake API Routes
  // ==========================================

  // Generate follow-up questions from initial customer concern
  app.post("/api/concerns/generate-questions", async (req, res) => {
    try {
      const parseResult = generateConcernQuestionsRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parseResult.error.issues 
        });
      }
      const result = await generateConcernFollowUpQuestions(parseResult.data);
      res.json(result);
    } catch (error: any) {
      console.error("Generate concern questions error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Review conversation and suggest additional questions
  app.post("/api/concerns/review", async (req, res) => {
    try {
      const parseResult = reviewConcernConversationRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parseResult.error.issues 
        });
      }
      const result = await reviewConcernConversation(parseResult.data);
      res.json(result);
    } catch (error: any) {
      console.error("Review conversation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clean and format conversation into paragraph
  app.post("/api/concerns/clean-conversation", async (req, res) => {
    try {
      const parseResult = cleanConversationRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parseResult.error.issues 
        });
      }
      const result = await cleanConcernConversation(parseResult.data);
      res.json(result);
    } catch (error: any) {
      console.error("Clean conversation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate AI sales script based on repair order
  app.post("/api/sales/generate-script", async (req, res) => {
    try {
      const { vehicle, jobs, customer, totalAmount, isInShop } = req.body;
      
      if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: "At least one job is required" });
      }
      
      // Fetch training guidelines from settings
      const settings = await storage.getSettings();
      const trainingGuidelines = settings?.salesScriptTraining || undefined;
      
      const result = await generateSalesScript({ 
        vehicle, 
        jobs, 
        customer, 
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        isInShop: Boolean(isInShop),
        trainingGuidelines
      });
      res.json(result);
    } catch (error: any) {
      console.error("Sales script generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
