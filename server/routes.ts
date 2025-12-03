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
  insertScriptFeedbackSchema,
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
  fetchEmployees,
  getEmployeeName,
  type ShopLocation
} from "./tekmetric";
import { z } from "zod";
import { setupAuth, isAuthenticated, isApproved } from "./auth";

export async function registerRoutes(app: Express) {
  // Set up username/password authentication
  await setupAuth(app);

  // Get user preferences (requires approval)
  app.get('/api/user/preferences', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const prefs = await storage.getUserPreferences(userId);
      res.json(prefs || {});
    } catch (error) {
      console.error("Error fetching preferences:", error);
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  // Update user preferences (requires approval)
  app.put('/api/user/preferences', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { displayName, defaultShopId, defaultTool, personalTraining } = req.body;
      
      const prefs = await storage.upsertUserPreferences(userId, {
        displayName,
        defaultShopId,
        defaultTool,
        personalTraining,
      });
      res.json(prefs);
    } catch (error) {
      console.error("Error updating preferences:", error);
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // Submit script feedback (requires approval)
  app.post('/api/scripts/feedback', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const parseResult = insertScriptFeedbackSchema.safeParse({ ...req.body, userId });
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid feedback data", 
          details: parseResult.error.issues 
        });
      }
      
      const feedback = await storage.createScriptFeedback(parseResult.data);
      res.json(feedback);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Get user's feedback history (requires approval)
  app.get('/api/scripts/feedback', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const feedback = await storage.getUserFeedback(userId, limit);
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Admin middleware to check if user is admin
  const isAdmin = async (req: any, res: any, next: any) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const isAdminUser = await storage.isUserAdmin(req.user.id);
      if (!isAdminUser) {
        return res.status(403).json({ message: "Admin access required" });
      }
      next();
    } catch (error) {
      console.error("Admin check error:", error);
      res.status(500).json({ message: "Failed to verify admin status" });
    }
  };

  // Check if current user is admin
  app.get('/api/admin/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const isAdminUser = await storage.isUserAdmin(userId);
      res.json({ isAdmin: isAdminUser });
    } catch (error) {
      console.error("Error checking admin status:", error);
      res.status(500).json({ message: "Failed to check admin status" });
    }
  });

  // Get all users (admin only)
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsersWithPreferences();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update a user's training data (admin only)
  app.put('/api/admin/users/:userId/training', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { personalTraining } = req.body;
      
      if (typeof personalTraining !== 'string') {
        return res.status(400).json({ error: "personalTraining must be a string" });
      }
      
      const prefs = await storage.updateUserTrainingAsAdmin(userId, personalTraining);
      res.json(prefs);
    } catch (error) {
      console.error("Error updating user training:", error);
      res.status(500).json({ message: "Failed to update user training" });
    }
  });

  // Create a new user (admin only)
  app.post('/api/admin/users', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { email, firstName, lastName, isAdmin: makeAdmin, password } = req.body;
      
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ error: "email, firstName, and lastName are required" });
      }
      
      // Validate password - must be at least 8 characters
      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      
      // Check if email already exists
      const existingUsers = await storage.getAllUsersWithPreferences();
      if (existingUsers.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }
      
      // Hash password
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 12);
      
      const newUser = await storage.createUserAsAdmin({
        email,
        firstName,
        lastName,
        isAdmin: makeAdmin === true,
        passwordHash,
      });
      
      res.status(201).json(newUser);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Delete a user (admin only)
  app.delete('/api/admin/users/:userId', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.user.id;
      
      // Prevent admin from deleting themselves
      if (userId === currentUserId) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }
      
      await storage.deleteUserAsAdmin(userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      if (error.message === "User not found") {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Update user's admin status (admin only)
  app.put('/api/admin/users/:userId/admin', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { isAdmin: makeAdmin } = req.body;
      const currentUserId = req.user.id;
      
      // Prevent admin from changing their own admin status
      if (userId === currentUserId) {
        return res.status(400).json({ error: "You cannot change your own admin status" });
      }
      
      if (typeof makeAdmin !== 'boolean') {
        return res.status(400).json({ error: "isAdmin must be a boolean" });
      }
      
      const prefs = await storage.updateUserAdminStatus(userId, makeAdmin);
      res.json(prefs);
    } catch (error: any) {
      console.error("Error updating user admin status:", error);
      if (error.message === "User not found") {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(500).json({ message: "Failed to update user admin status" });
    }
  });

  // Get pending approval users (admin only)
  app.get('/api/admin/users/pending', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const pendingUsers = await storage.getPendingApprovalUsers();
      res.json(pendingUsers);
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  });

  // Update user's approval status (admin only)
  app.put('/api/admin/users/:userId/approval', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;
      
      if (status !== 'approved' && status !== 'rejected') {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }
      
      const prefs = await storage.updateUserApprovalStatus(userId, status);
      res.json(prefs);
    } catch (error: any) {
      console.error("Error updating user approval status:", error);
      if (error.message === "User not found") {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(500).json({ message: "Failed to update user approval status" });
    }
  });

  // ==================== LABOR RATE GROUPS (ADMIN) ====================
  
  // Get all labor rate groups (admin only - sees all shops)
  app.get('/api/admin/labor-rate-groups', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const groups = await storage.getLaborRateGroups();
      res.json(groups);
    } catch (error) {
      console.error("Error fetching labor rate groups:", error);
      res.status(500).json({ message: "Failed to fetch labor rate groups" });
    }
  });
  
  // Create labor rate group (admin only)
  app.post('/api/admin/labor-rate-groups', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { shopId, name, makes, laborRate } = req.body;
      
      if (!shopId || !name || !makes || !laborRate) {
        return res.status(400).json({ error: "shopId, name, makes, and laborRate are required" });
      }
      
      if (!Array.isArray(makes) || makes.length === 0) {
        return res.status(400).json({ error: "makes must be a non-empty array" });
      }
      
      const group = await storage.createLaborRateGroup({
        shopId,
        name,
        makes,
        laborRate: Math.round(laborRate), // Ensure it's an integer (cents)
        createdBy: req.user.id,
      });
      
      res.status(201).json(group);
    } catch (error) {
      console.error("Error creating labor rate group:", error);
      res.status(500).json({ message: "Failed to create labor rate group" });
    }
  });
  
  // Update labor rate group (admin only)
  app.put('/api/admin/labor-rate-groups/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { shopId, name, makes, laborRate } = req.body;
      
      const updateData: any = {};
      if (shopId !== undefined) updateData.shopId = shopId;
      if (name !== undefined) updateData.name = name;
      if (makes !== undefined) {
        if (!Array.isArray(makes) || makes.length === 0) {
          return res.status(400).json({ error: "makes must be a non-empty array" });
        }
        updateData.makes = makes;
      }
      if (laborRate !== undefined) updateData.laborRate = Math.round(laborRate);
      
      const group = await storage.updateLaborRateGroup(id, updateData);
      res.json(group);
    } catch (error: any) {
      console.error("Error updating labor rate group:", error);
      if (error.message === "Labor rate group not found") {
        return res.status(404).json({ error: "Labor rate group not found" });
      }
      res.status(500).json({ message: "Failed to update labor rate group" });
    }
  });
  
  // Delete labor rate group (admin only)
  app.delete('/api/admin/labor-rate-groups/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteLaborRateGroup(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting labor rate group:", error);
      res.status(500).json({ message: "Failed to delete labor rate group" });
    }
  });
  
  // ==================== LABOR RATE GROUPS (USER) ====================
  
  // Get labor rate groups for a specific shop (authenticated users)
  // The extension uses this to fetch groups based on the current Tekmetric shop
  app.get('/api/labor-rate-groups', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const shopId = req.query.shopId as string | undefined;
      
      // If no shopId provided, use user's default shop
      let targetShopId = shopId;
      if (!targetShopId) {
        const prefs = await storage.getUserPreferences(req.user.id);
        targetShopId = prefs?.defaultShopId || undefined;
      }
      
      const groups = await storage.getLaborRateGroups(targetShopId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching labor rate groups:", error);
      res.status(500).json({ message: "Failed to fetch labor rate groups" });
    }
  });

  // Search endpoint (requires authentication and approval)
  app.post("/api/search", isAuthenticated, isApproved, async (req: any, res) => {
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

      // Populate service writer names for results that don't have them
      // This fetches from Tekmetric API if needed (including former employees)
      for (const result of results) {
        if (!result.job.serviceWriterName) {
          const roRawData = result.job.repairOrder?.rawData as any;
          const writerId = roRawData?.serviceWriterId;
          if (writerId) {
            try {
              const writerName = await getEmployeeName(writerId);
              if (writerName) {
                result.job.serviceWriterName = writerName;
              }
            } catch (err) {
              // Silently continue if we can't get the name
            }
          }
        }
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

  // Get recent searches endpoint (requires authentication and approval)
  app.get("/api/search/recent", isAuthenticated, isApproved, async (req: any, res) => {
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

  // Fetch RO data directly from Tekmetric API (for Chrome extension)
  app.get("/api/tekmetric/ro/:shopId/:roId", async (req, res) => {
    try {
      const { shopId, roId } = req.params;
      
      if (!shopId || !roId) {
        return res.status(400).json({ error: "Shop ID and RO ID are required" });
      }
      
      const { fetchRepairOrder } = await import("./tekmetric");
      const roData = await fetchRepairOrder(roId, shopId);
      
      if (!roData) {
        return res.status(404).json({ error: "Repair order not found or shop not configured" });
      }
      
      res.json(roData);
    } catch (error: any) {
      console.error("Fetch RO error:", error);
      res.status(500).json({ error: error.message });
    }
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

  // Generate follow-up questions from initial customer concern (requires authentication and approval)
  app.post("/api/concerns/generate-questions", isAuthenticated, isApproved, async (req: any, res) => {
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

  // Review conversation and suggest additional questions (requires authentication and approval)
  app.post("/api/concerns/review", isAuthenticated, isApproved, async (req: any, res) => {
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

  // Clean and format conversation into paragraph (requires authentication and approval)
  app.post("/api/concerns/clean-conversation", isAuthenticated, isApproved, async (req: any, res) => {
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

  // Generate AI sales script based on repair order (requires authentication and approval)
  app.post("/api/sales/generate-script", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const { vehicle, jobs, customer, totalAmount, isInShop } = req.body;
      
      if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: "At least one job is required" });
      }
      
      // Try to get per-user training data if authenticated
      let trainingGuidelines: string | undefined;
      let usedPersonalTraining = false;
      
      if (req.user?.id) {
        const userId = req.user.id;
        const userPrefs = await storage.getUserPreferences(userId);
        if (userPrefs?.personalTraining) {
          trainingGuidelines = userPrefs.personalTraining;
          usedPersonalTraining = true;
          console.log(`Using personal training data for user ${userId}`);
        }
      }
      
      // Fall back to global settings if no user training
      if (!trainingGuidelines) {
        const settings = await storage.getSettings();
        trainingGuidelines = settings?.salesScriptTraining || undefined;
      }
      
      const result = await generateSalesScript({ 
        vehicle, 
        jobs, 
        customer, 
        totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
        isInShop: Boolean(isInShop),
        trainingGuidelines
      });
      res.json({ ...result, usedPersonalTraining });
    } catch (error: any) {
      console.error("Sales script generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================
  // RingCentral Call Coaching API Routes
  // ==========================================

  // Test RingCentral connection (admin only)
  app.get("/api/ringcentral/test", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { testConnection } = await import("./ringcentral");
      const result = await testConnection();
      res.json(result);
    } catch (error: any) {
      console.error("RingCentral test error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Sync call logs from RingCentral (admin only)
  app.post("/api/ringcentral/sync", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { syncCallRecords } = await import("./ringcentral");
      const { dateFrom, dateTo } = req.body;
      
      const fromDate = dateFrom ? new Date(dateFrom) : undefined;
      const toDate = dateTo ? new Date(dateTo) : undefined;
      
      const stats = await syncCallRecords(fromDate, toDate);
      res.json({ success: true, stats });
    } catch (error: any) {
      console.error("RingCentral sync error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Fetch RingCentral extensions (admin only)
  app.get("/api/ringcentral/extensions", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { fetchExtensions } = await import("./ringcentral");
      const extensions = await fetchExtensions();
      res.json(extensions);
    } catch (error: any) {
      console.error("RingCentral extensions error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get call recordings for current user (requires approval)
  app.get("/api/calls", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      
      // Check if user is admin or manager
      const isAdminUser = await storage.isUserAdmin(userId);
      const userPrefs = await storage.getUserPreferences(userId);
      const managedShopId = userPrefs?.managedShopId;
      
      let calls;
      if (isAdminUser) {
        // Admins see all calls
        calls = await storage.getAllCallRecordings(dateFrom, dateTo, limit);
      } else if (managedShopId) {
        // Managers see calls for their shop
        calls = await storage.getCallRecordingsForShop(managedShopId, dateFrom, dateTo, limit);
      } else {
        // Regular users see only their calls
        calls = await storage.getCallRecordingsForUser(userId, dateFrom, dateTo, limit);
      }
      
      res.json(calls);
    } catch (error: any) {
      console.error("Get calls error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get single call recording with score (requires approval)
  app.get("/api/calls/:id", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Get call score if exists
      const score = await storage.getCallScore(callId);
      
      res.json({ ...call, score });
    } catch (error: any) {
      console.error("Get call error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==========================================
  // Coaching Criteria API Routes (Admin only)
  // ==========================================

  // Get all coaching criteria
  app.get("/api/coaching/criteria", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const isAdminUser = await storage.isUserAdmin(userId);
      
      // Admins see all, others see only active
      const criteria = isAdminUser 
        ? await storage.getAllCoachingCriteria()
        : await storage.getActiveCoachingCriteria();
      
      res.json(criteria);
    } catch (error: any) {
      console.error("Get coaching criteria error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create coaching criteria (admin only)
  app.post("/api/coaching/criteria", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const data = { ...req.body, createdBy: userId };
      
      const criteria = await storage.createCoachingCriteria(data);
      res.json(criteria);
    } catch (error: any) {
      console.error("Create coaching criteria error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update coaching criteria (admin only) - PUT for full replacement
  app.put("/api/coaching/criteria/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const criteria = await storage.updateCoachingCriteria(req.params.id, req.body);
      res.json(criteria);
    } catch (error: any) {
      console.error("Update coaching criteria error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Update coaching criteria (admin only) - PATCH for partial updates
  app.patch("/api/coaching/criteria/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const criteria = await storage.updateCoachingCriteria(req.params.id, req.body);
      res.json(criteria);
    } catch (error: any) {
      console.error("Update coaching criteria error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete coaching criteria (admin only)
  app.delete("/api/coaching/criteria/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteCoachingCriteria(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete coaching criteria error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Seed default coaching criteria (admin only)
  app.post("/api/coaching/criteria/seed-defaults", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      const defaultCriteria = [
        {
          name: "Rapport Building",
          description: "Did the advisor establish rapport with the customer? Friendly greeting, use of customer's name, genuine interest.",
          keywords: ["hello", "thank you", "name", "appreciate", "how are you"],
          aiPrompt: "Look for friendly greetings, personalized conversation, and genuine interest in the customer's needs.",
          weight: 10,
          category: "relationship",
          sortOrder: 1,
          createdBy: userId,
        },
        {
          name: "Inspection Credentials",
          description: "Did the advisor explain the inspection process and technician qualifications?",
          keywords: ["ASE certified", "master technician", "trained", "experience", "inspection"],
          aiPrompt: "Check if advisor mentioned technician qualifications, certifications, or expertise.",
          weight: 10,
          category: "credibility",
          sortOrder: 2,
          createdBy: userId,
        },
        {
          name: "Digital Resources Confirmation",
          description: "Did the advisor mention or confirm digital inspection resources being sent?",
          keywords: ["digital inspection", "photos", "video", "text", "email", "link"],
          aiPrompt: "Look for mentions of sending digital inspection results, photos, or videos to the customer.",
          weight: 10,
          category: "communication",
          sortOrder: 3,
          createdBy: userId,
        },
        {
          name: "Good-Good-Bad Presentation",
          description: "Did the advisor present findings in the Good-Good-Bad format? Positive before negative.",
          keywords: ["good news", "great condition", "needs attention", "recommend"],
          aiPrompt: "Check if the advisor started with positive findings before presenting needed repairs.",
          weight: 10,
          category: "presentation",
          sortOrder: 4,
          createdBy: userId,
        },
        {
          name: "Safety Concern Emphasis",
          description: "Did the advisor emphasize safety concerns when presenting repairs?",
          keywords: ["safety", "family", "safe", "concern", "important", "risk"],
          aiPrompt: "Look for emphasis on safety implications of repairs, especially for brakes, tires, and steering.",
          weight: 10,
          category: "presentation",
          sortOrder: 5,
          createdBy: userId,
        },
        {
          name: "3yr/36k Mile Warranty",
          description: "Did the advisor mention the HEART warranty on repairs?",
          keywords: ["warranty", "3 year", "36,000", "36000", "covered", "guarantee"],
          aiPrompt: "Check if advisor mentioned the 3-year/36,000-mile warranty on repairs.",
          weight: 10,
          category: "value",
          sortOrder: 6,
          createdBy: userId,
        },
        {
          name: "Price Presentation (Investment)",
          description: "Did the advisor present prices as an 'investment' rather than a cost?",
          keywords: ["investment", "value", "save", "protect", "worth"],
          aiPrompt: "Look for positive framing of repair costs as investments in vehicle longevity and safety.",
          weight: 10,
          category: "presentation",
          sortOrder: 7,
          createdBy: userId,
        },
        {
          name: "Permission to Inspect Rest",
          description: "Did the advisor ask for permission to inspect the rest of the vehicle?",
          keywords: ["inspect", "check", "look at", "while we have it", "courtesy"],
          aiPrompt: "Check if advisor asked permission to perform a courtesy inspection or check other items.",
          weight: 10,
          category: "upsell",
          sortOrder: 8,
          createdBy: userId,
        },
        {
          name: "Follow-up Commitment",
          description: "Did the advisor establish a follow-up plan or next appointment?",
          keywords: ["next time", "follow up", "schedule", "come back", "appointment", "reminder"],
          aiPrompt: "Look for discussion of future maintenance needs or scheduling next visit.",
          weight: 10,
          category: "retention",
          sortOrder: 9,
          createdBy: userId,
        },
        {
          name: "Objection Handling",
          description: "How well did the advisor handle customer objections or concerns?",
          keywords: ["understand", "I hear you", "let me explain", "alternative", "option"],
          aiPrompt: "Evaluate how the advisor responded to price objections, time concerns, or repair necessity questions.",
          weight: 10,
          category: "objection",
          sortOrder: 10,
          createdBy: userId,
        },
      ];

      const created = [];
      for (const c of defaultCriteria) {
        const criteria = await storage.createCoachingCriteria(c);
        created.push(criteria);
      }

      res.json({ success: true, created: created.length });
    } catch (error: any) {
      console.error("Seed coaching criteria error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
