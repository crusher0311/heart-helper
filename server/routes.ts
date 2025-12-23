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
  scoreCallTranscript,
  generateTrainingRecommendations,
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

  // Reset user's password (admin only)
  app.put('/api/admin/users/:userId/password', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { password } = req.body;
      
      // Validate password - must be at least 8 characters
      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      
      // Hash password
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 12);
      
      await storage.updateUserPassword(userId, passwordHash);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error resetting user password:", error);
      if (error.message === "User not found") {
        return res.status(404).json({ error: "User not found" });
      }
      res.status(500).json({ message: "Failed to reset password" });
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
  
  // ==================== JOB LABOR RATES (ADMIN) ====================
  // Fixed rates for specific job types (e.g., Cabin Filter = $100)
  
  // Get all job labor rates (admin view - sees all)
  app.get('/api/admin/job-labor-rates', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const rates = await storage.getJobLaborRates(false); // Include inactive
      res.json(rates);
    } catch (error) {
      console.error("Error fetching job labor rates:", error);
      res.status(500).json({ message: "Failed to fetch job labor rates" });
    }
  });
  
  // Create job labor rate (admin only)
  app.post('/api/admin/job-labor-rates', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { name, keywords, defaultRate, shopOverrides, isActive, sortOrder } = req.body;
      
      if (!name || !keywords || !Array.isArray(keywords) || keywords.length === 0 || defaultRate === undefined) {
        return res.status(400).json({ error: "name, keywords (non-empty array), and defaultRate are required" });
      }
      
      const rate = await storage.createJobLaborRate({
        name,
        keywords,
        defaultRate: Math.round(defaultRate),
        shopOverrides: shopOverrides || {},
        isActive: isActive !== false,
        sortOrder: sortOrder || 0,
        createdBy: req.user.id,
      });
      res.json(rate);
    } catch (error) {
      console.error("Error creating job labor rate:", error);
      res.status(500).json({ message: "Failed to create job labor rate" });
    }
  });
  
  // Update job labor rate (admin only)
  app.put('/api/admin/job-labor-rates/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, keywords, defaultRate, shopOverrides, isActive, sortOrder } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (keywords !== undefined) {
        if (!Array.isArray(keywords) || keywords.length === 0) {
          return res.status(400).json({ error: "keywords must be a non-empty array" });
        }
        updateData.keywords = keywords;
      }
      if (defaultRate !== undefined) updateData.defaultRate = Math.round(defaultRate);
      if (shopOverrides !== undefined) updateData.shopOverrides = shopOverrides;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      
      const rate = await storage.updateJobLaborRate(id, updateData);
      res.json(rate);
    } catch (error: any) {
      console.error("Error updating job labor rate:", error);
      if (error.message === "Job labor rate not found") {
        return res.status(404).json({ error: "Job labor rate not found" });
      }
      res.status(500).json({ message: "Failed to update job labor rate" });
    }
  });
  
  // Delete job labor rate (admin only)
  app.delete('/api/admin/job-labor-rates/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteJobLaborRate(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting job labor rate:", error);
      res.status(500).json({ message: "Failed to delete job labor rate" });
    }
  });
  
  // ==================== JOB LABOR RATES (USER) ====================
  
  // Get active job labor rates (authenticated users)
  // The extension uses this to lookup rates for specific job types
  app.get('/api/job-labor-rates', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const rates = await storage.getJobLaborRates(true); // Only active
      res.json(rates);
    } catch (error) {
      console.error("Error fetching job labor rates:", error);
      res.status(500).json({ message: "Failed to fetch job labor rates" });
    }
  });
  
  // Find matching job labor rate for a given job name
  // Returns the rate amount and matched rule
  app.post('/api/job-labor-rates/match', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const { jobName, shopId } = req.body;
      
      if (!jobName) {
        return res.status(400).json({ error: "jobName is required" });
      }
      
      const match = await storage.findMatchingJobLaborRate(jobName, shopId);
      
      if (!match) {
        return res.json({ matched: false });
      }
      
      res.json({
        matched: true,
        rate: match.rate,
        rateFormatted: `$${(match.rate / 100).toFixed(2)}`,
        matchedRule: {
          id: match.jobLaborRate.id,
          name: match.jobLaborRate.name,
          keywords: match.jobLaborRate.keywords,
        },
      });
    } catch (error) {
      console.error("Error matching job labor rate:", error);
      res.status(500).json({ message: "Failed to match job labor rate" });
    }
  });
  
  // ==================== VEHICLE HISTORY & WARRANTY ANALYSIS ====================
  
  // Get vehicle service history by VIN with warranty analysis
  // Returns HEART shop history with warranty calculations + Carfax history (if available)
  app.get('/api/vehicle-history/:vin', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const { vin } = req.params;
      const currentMileage = req.query.mileage ? parseInt(req.query.mileage as string) : undefined;
      const includeCarfax = req.query.includeCarfax !== 'false';
      const shopId = req.query.shopId as string | undefined;
      
      if (!vin || vin.length < 11) {
        return res.status(400).json({ error: "Valid VIN is required" });
      }
      
      // Get HEART shop history with warranty calculations
      const history = await storage.getVehicleHistoryByVin(vin, currentMileage);
      
      // Optionally fetch Carfax history
      if (includeCarfax) {
        try {
          const { fetchCarfaxHistory, getAvailableShops } = await import("./tekmetric");
          const shops = getAvailableShops();
          const targetShop = shopId && ['NB', 'WM', 'EV'].includes(shopId) 
            ? shopId as 'NB' | 'WM' | 'EV' 
            : shops[0];
          
          if (targetShop) {
            const carfaxHistory = await fetchCarfaxHistory(targetShop, vin);
            history.carfaxHistory = carfaxHistory;
          }
        } catch (carfaxError) {
          console.error("Failed to fetch Carfax history:", carfaxError);
          // Continue without Carfax data
        }
      }
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching vehicle history:", error);
      res.status(500).json({ message: "Failed to fetch vehicle history" });
    }
  });
  
  // Cross-reference recommended jobs against vehicle history
  // Used by Chrome extension to flag warranty/recently-serviced items
  app.post('/api/vehicle-history/check-recommendations', isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const schema = z.object({
        vin: z.string().min(11),
        currentMileage: z.number().optional(),
        recommendedJobs: z.array(z.string()), // Array of job names to check
        shopId: z.string().optional(),
      });
      
      const { vin, currentMileage, recommendedJobs, shopId } = schema.parse(req.body);
      
      // Get vehicle history
      const history = await storage.getVehicleHistoryByVin(vin, currentMileage);
      
      // Optionally fetch Carfax history
      try {
        const { fetchCarfaxHistory, getAvailableShops } = await import("./tekmetric");
        const shops = getAvailableShops();
        const targetShop = shopId && ['NB', 'WM', 'EV'].includes(shopId) 
          ? shopId as 'NB' | 'WM' | 'EV' 
          : shops[0];
        
        if (targetShop) {
          const carfaxHistory = await fetchCarfaxHistory(targetShop, vin);
          history.carfaxHistory = carfaxHistory;
        }
      } catch (carfaxError) {
        console.error("Failed to fetch Carfax for recommendations:", carfaxError);
      }
      
      // Cross-reference each recommended job against history
      const results = recommendedJobs.map(jobName => {
        const lowerJobName = jobName.toLowerCase();
        
        // Check HEART history first
        const heartMatch = history.heartHistory.find(item => 
          item.jobName.toLowerCase().includes(lowerJobName) || 
          lowerJobName.includes(item.jobName.toLowerCase())
        );
        
        if (heartMatch) {
          return {
            jobName,
            status: heartMatch.warrantyStatus,
            source: 'heart' as const,
            lastServiceDate: heartMatch.serviceDate,
            lastServiceMileage: heartMatch.mileage,
            daysRemaining: heartMatch.daysRemaining,
            milesRemaining: heartMatch.milesRemaining,
            shopName: heartMatch.shopName,
            warrantyExpiresDate: heartMatch.warrantyExpiresDate,
            warrantyExpiresMileage: heartMatch.warrantyExpiresMileage,
          };
        }
        
        // Check Carfax history
        if (history.carfaxHistory) {
          const carfaxMatch = history.carfaxHistory.find(record => 
            record.description.toLowerCase().includes(lowerJobName) ||
            lowerJobName.includes(record.description.toLowerCase())
          );
          
          if (carfaxMatch) {
            const serviceDate = new Date(carfaxMatch.date);
            const today = new Date();
            const daysSince = Math.ceil((today.getTime() - serviceDate.getTime()) / (1000 * 60 * 60 * 24));
            
            return {
              jobName,
              status: daysSince <= 180 ? 'serviced_elsewhere' as const : 'due_for_service' as const,
              source: 'carfax' as const,
              lastServiceDate: carfaxMatch.date,
              lastServiceMileage: carfaxMatch.odometer,
              daysSinceService: daysSince,
            };
          }
        }
        
        // No history found - recommend it
        return {
          jobName,
          status: 'due_for_service' as const,
          source: null,
          message: 'No service history found',
        };
      });
      
      res.json({
        vin,
        vehicle: history.vehicle,
        currentMileage,
        recommendations: results,
      });
    } catch (error) {
      console.error("Error checking recommendations:", error);
      res.status(500).json({ message: "Failed to check recommendations" });
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

  // Update transcription provider (admin only)
  app.post("/api/admin/settings/transcription-provider", isAuthenticated, isApproved, isAdmin, async (req: any, res) => {
    try {
      const { provider } = req.body;
      const validProviders = ['deepgram', 'assemblyai', 'whisper'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ 
          error: "Invalid provider", 
          message: `Provider must be one of: ${validProviders.join(', ')}` 
        });
      }
      const settings = await storage.updateSettings({ transcriptionProvider: provider });
      res.json({ success: true, provider: settings.transcriptionProvider });
    } catch (error: any) {
      console.error("Update transcription provider error:", error);
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

  app.post("/api/ringcentral/backfill-session-ids", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { backfillSessionIds } = await import("./ringcentral");
      const daysBack = parseInt(req.body.daysBack) || 90;
      
      const stats = await backfillSessionIds(daysBack);
      res.json({ 
        success: true, 
        message: `Backfill complete: ${stats.updated} updated, ${stats.notFound} not found in RingCentral, ${stats.alreadySet} already had sessionId`,
        stats 
      });
    } catch (error: any) {
      console.error("Backfill sessionIds error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Update call type (admin/manager only)
  app.patch("/api/calls/:id/type", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Only admins and managers can change call type
      if (!isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied. Admin or manager role required." });
      }
      
      const callId = req.params.id;
      const { callType } = req.body;
      
      if (!callType || !['sales', 'appointment_request', 'transfer', 'price_shopper'].includes(callType)) {
        return res.status(400).json({ message: "Invalid call type. Must be 'sales', 'appointment_request', 'transfer', or 'price_shopper'." });
      }
      
      await storage.updateCallRecording(callId, { callType });
      
      res.json({ success: true, callType });
    } catch (error: any) {
      console.error("Update call type error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Transcribe a single call (admin only)
  // Supports ?force=true to re-fetch even if transcript exists
  // Tries RingCentral methods first, then falls back to Whisper
  app.post("/api/calls/:id/transcribe", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const force = req.query.force === 'true' || req.body.force === true;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      if (!call.ringcentralRecordingId) {
        return res.status(400).json({ message: "No recording available for this call" });
      }
      
      // Check if already transcribed (unless force is true)
      if (!force && call.transcriptText && call.transcriptText.length > 50) {
        return res.json({ 
          success: true, 
          message: "Call already has transcript",
          transcriptLength: call.transcriptText.length,
        });
      }
      
      // Try RingCentral methods first (RingSense, Speech-to-Text)
      const { fetchTranscript, smartTranscribeCall } = await import("./ringcentral");
      let result = await fetchTranscript(call.ringcentralRecordingId);
      
      // If RingCentral methods failed, try AssemblyAI/Whisper
      if (!result.transcriptText) {
        console.log(`[Transcribe] RingCentral methods failed for ${callId}, trying AssemblyAI/Whisper...`);
        
        const transcribeResult = await smartTranscribeCall(
          callId,
          call.ringcentralRecordingId,
          call.durationSeconds ?? null,
          call.customerName ?? null
        );
        
        if (transcribeResult.success && transcribeResult.transcriptText) {
          result = {
            transcriptText: transcribeResult.transcriptText,
            transcriptJson: { 
              source: transcribeResult.transcriptSource || "unknown", 
              isSalesCall: transcribeResult.isSalesCall,
              utterances: transcribeResult.utterances,
            },
            summary: null,
          };
        }
      }
      
      if (!result.transcriptText) {
        return res.status(400).json({ 
          message: "Could not fetch transcript. RingCentral, AssemblyAI, and Whisper transcription all failed."
        });
      }
      
      // Update the call record with transcript
      await storage.updateCallRecording(callId, {
        transcriptText: result.transcriptText,
        transcript: result.transcriptJson,
      });
      
      res.json({ 
        success: true, 
        message: force ? "Transcript re-fetched successfully" : "Transcript fetched successfully",
        transcriptLength: result.transcriptText.length,
        source: result.transcriptJson?.source || "unknown",
      });
    } catch (error: any) {
      console.error("Transcribe call error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Batch transcribe calls without transcripts (admin only)
  app.post("/api/ringcentral/transcribe-batch", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.body.limit) || 10, 25); // Max 25 at a time
      
      // Get calls with recordings but no transcripts
      const callsToTranscribe = await storage.getCallsNeedingTranscription(limit);
      
      if (callsToTranscribe.length === 0) {
        return res.json({ 
          success: true, 
          message: "No calls need transcription",
          transcribed: 0,
          failed: 0,
        });
      }
      
      const { fetchTranscript } = await import("./ringcentral");
      const results = { transcribed: 0, failed: 0, errors: [] as string[] };
      
      for (const call of callsToTranscribe) {
        try {
          if (!call.ringcentralRecordingId) {
            results.failed++;
            continue;
          }
          
          const result = await fetchTranscript(call.ringcentralRecordingId);
          
          if (result.transcriptText) {
            await storage.updateCallRecording(call.id, {
              transcriptText: result.transcriptText,
              transcript: result.transcriptJson,
            });
            results.transcribed++;
            console.log(`[Transcribe] Successfully transcribed call ${call.id}`);
          } else {
            results.failed++;
            console.log(`[Transcribe] No transcript available for call ${call.id}`);
          }
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Call ${call.id}: ${err.message}`);
          console.error(`[Transcribe] Error transcribing call ${call.id}:`, err.message);
        }
      }
      
      res.json({
        success: true,
        message: `Transcribed ${results.transcribed} of ${callsToTranscribe.length} calls`,
        transcribed: results.transcribed,
        failed: results.failed,
        errors: results.errors.slice(0, 5),
      });
    } catch (error: any) {
      console.error("Batch transcribe error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get count of calls needing transcription (admin only)
  app.get("/api/ringcentral/transcription-status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getTranscriptionStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Transcription status error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Smart transcription using OpenAI Whisper (admin only)
  // This uses sample-first approach to save costs
  app.post("/api/ringcentral/smart-transcribe", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.body.limit) || 10, 25); // Max 25 at a time
      
      const { batchSmartTranscribe } = await import("./ringcentral");
      const result = await batchSmartTranscribe(limit);
      
      res.json({
        success: true,
        message: `Processed ${result.processed} calls, found ${result.salesCalls} sales calls, skipped ${result.skipped}`,
        processed: result.processed,
        salesCalls: result.salesCalls,
        skipped: result.skipped,
        errors: result.errors,
        costSaved: `$${(result.totalCostSaved / 100).toFixed(2)}`,
      });
    } catch (error: any) {
      console.error("Smart transcribe error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Smart transcribe single call (admin only)
  app.post("/api/calls/:id/smart-transcribe", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      if (!call.ringcentralRecordingId) {
        return res.status(400).json({ message: "Call has no recording" });
      }
      
      const { smartTranscribeCall } = await import("./ringcentral");
      const result = await smartTranscribeCall(
        call.id,
        call.ringcentralRecordingId,
        call.durationSeconds || 0,
        call.customerName || null
      );
      
      if (result.skipped) {
        return res.json({
          success: true,
          skipped: true,
          reason: result.skipReason,
        });
      }
      
      if (result.success) {
        // Save the transcript
        await storage.updateCallTranscript(call.id, {
          transcript: result.transcriptText,
          transcriptJson: { 
            source: "whisper", 
            sampleOnly: result.sampleOnly,
            isSalesCall: result.isSalesCall,
          },
          isSalesCall: result.isSalesCall,
        });
        
        return res.json({
          success: true,
          isSalesCall: result.isSalesCall,
          sampleOnly: result.sampleOnly,
          transcriptLength: result.transcriptText?.length || 0,
          costSaved: result.costSaved ? `$${(result.costSaved / 100).toFixed(3)}` : undefined,
        });
      }
      
      res.status(400).json({ 
        success: false, 
        message: result.skipReason || "Failed to transcribe" 
      });
    } catch (error: any) {
      console.error("Smart transcribe call error:", error);
      res.status(500).json({ message: error.message });
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

  // Get all extension-to-user mappings (admin only)
  app.get("/api/ringcentral/mappings", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const mappings = await storage.getAllRingcentralUsers();
      res.json(mappings);
    } catch (error: any) {
      console.error("Get mappings error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Save extension-to-user mappings (admin only)
  // Only upserts provided mappings; does NOT delete existing mappings not in the request
  app.post("/api/ringcentral/mappings", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { mappings } = req.body;
      
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ message: "Invalid mappings format - expected array" });
      }

      // Validate each mapping has required fields
      for (const mapping of mappings) {
        if (!mapping.extensionId || typeof mapping.extensionId !== 'string') {
          return res.status(400).json({ message: "Each mapping must have a valid extensionId" });
        }
        // userId can be "none" or "" for unmapping, otherwise must be a valid string
        if (typeof mapping.userId !== 'string') {
          return res.status(400).json({ message: "Each mapping must have a userId (use 'none' or empty string to unmap)" });
        }
      }

      // Get existing mappings to handle unmapping
      const existingMappings = await storage.getAllRingcentralUsers();
      const existingByExtId = new Map(
        existingMappings.map(m => [m.ringcentralExtensionId, m])
      );

      // Process each mapping in the request
      const results = [];
      const processedExtIds = new Set<string>();
      
      for (const mapping of mappings) {
        // Only require extensionId to be truthy - userId can be empty for unmapping
        if (mapping.extensionId) {
          processedExtIds.add(mapping.extensionId);
          
          if (mapping.userId === "none" || mapping.userId === "") {
            // Unmapping request - delete if exists
            const existing = existingByExtId.get(mapping.extensionId);
            if (existing) {
              await storage.deleteRingcentralUser(existing.id);
            }
          } else if (mapping.userId) {
            // Map or update mapping (only if userId is a non-empty string)
            const result = await storage.upsertRingcentralUserMapping(
              mapping.extensionId,
              mapping.userId,
              mapping.extensionNumber || "",
              mapping.extensionName || ""
            );
            results.push(result);
          }
        }
      }

      res.json({ success: true, count: results.length });
    } catch (error: any) {
      console.error("Save mappings error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get call recordings for current user (requires approval)
  app.get("/api/calls", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      const direction = req.query.direction as string | undefined;
      const filterUserId = req.query.userId as string | undefined;
      const transcribedFilter = req.query.transcribedFilter as string | undefined;
      
      // Validate direction if provided
      const validDirections = ['Inbound', 'Outbound'];
      const normalizedDirection = direction && validDirections.includes(direction) ? direction : undefined;
      
      // Check if user is admin or manager
      const isAdminUser = await storage.isUserAdmin(userId);
      const userPrefs = await storage.getUserPreferences(userId);
      const managedShopId = userPrefs?.managedShopId;
      
      let result;
      if (isAdminUser) {
        // Admins see all calls, can optionally filter by user
        if (filterUserId) {
          const calls = await storage.getCallRecordingsForUser(filterUserId, dateFrom, dateTo, limit, normalizedDirection, offset);
          result = { calls, total: calls.length + offset }; // Approximate for user filter
        } else {
          result = await storage.getAllCallRecordings(dateFrom, dateTo, limit, normalizedDirection, offset, transcribedFilter);
        }
      } else if (managedShopId) {
        // Managers see calls for their shop
        const calls = await storage.getCallRecordingsForShop(managedShopId, dateFrom, dateTo, limit, normalizedDirection, offset);
        result = { calls, total: calls.length + offset }; // Approximate for shop filter
      } else {
        // Regular users see only their calls
        const calls = await storage.getCallRecordingsForUser(userId, dateFrom, dateTo, limit, normalizedDirection, offset);
        result = { calls, total: calls.length + offset }; // Approximate for user filter
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Get calls error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Search call transcripts (requires approval, role-based access)
  app.get("/api/calls/search", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const query = req.query.query as string;
      
      if (!query || query.trim().length < 2) {
        return res.status(400).json({ message: "Search query must be at least 2 characters" });
      }
      
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;
      const direction = req.query.direction as string | undefined;
      const filterUserId = req.query.userId as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const user = req.user;
      const isAdminUser = await storage.isUserAdmin(user.id);
      let calls;
      
      // Role-based access: admin sees all, manager sees shop, user sees own
      if (isAdminUser) {
        // Admin can filter by any user, or see all if no filter
        calls = await storage.searchCallRecordings(query.trim(), dateFrom, dateTo, limit, direction, undefined, filterUserId);
      } else {
        // Get user preferences for shop access
        const prefs = await storage.getUserPreferences(user.id);
        if (prefs?.managedShopId) {
          // Manager: search within their shop (user filter not supported without shop membership verification)
          calls = await storage.searchCallRecordings(query.trim(), dateFrom, dateTo, limit, direction, prefs.managedShopId, undefined);
        } else {
          // Regular user: search only their own calls (cannot filter by other users)
          calls = await storage.searchCallRecordings(query.trim(), dateFrom, dateTo, limit, direction, undefined, user.id);
        }
      }
      
      res.json(calls);
    } catch (error: any) {
      console.error("Search calls error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get single call recording with score (requires approval, role-based access)
  app.get("/api/calls/:id", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Role-based access control: admin sees all, manager sees shop, user sees own
      const user = req.user;
      const isAdminUser = await storage.isUserAdmin(user.id);
      if (!isAdminUser) {
        const prefs = await storage.getUserPreferences(user.id);
        if (prefs?.managedShopId) {
          // Manager: can only access calls from their shop
          if (call.shopId !== prefs.managedShopId) {
            return res.status(403).json({ message: "Access denied: this call is not from your shop" });
          }
        } else {
          // Regular user: can only access their own calls
          if (call.userId !== user.id) {
            return res.status(403).json({ message: "Access denied: you can only access your own calls" });
          }
        }
      }
      
      // Get call score if exists
      const rawScore = await storage.getCallScore(callId);
      
      // Transform score to frontend format
      let score = null;
      if (rawScore) {
        // Get all coaching criteria to provide names and max scores
        const allCriteria = await storage.getAllCoachingCriteria();
        const criteriaMap = new Map(allCriteria.map(c => [c.id, c]));
        
        // Parse criteriaScores from jsonb
        const criteriaScoresJson = rawScore.criteriaScores as Record<string, { score: number; found: boolean; excerpts: string[] }> || {};
        
        // Calculate max possible score (each criterion is worth 5 points)
        const maxPossibleScore = allCriteria.filter(c => c.isActive).length * 5;
        
        // Build the criteriaScores array for frontend
        const criteriaScores = Object.entries(criteriaScoresJson).map(([criterionId, data]) => {
          const criterion = criteriaMap.get(criterionId);
          return {
            criterionId,
            criterionName: criterion?.name || 'Unknown Criterion',
            score: data.score || 0,
            maxScore: 5,
            found: data.found || false,
            excerpts: data.excerpts || [],
          };
        });
        
        score = {
          id: rawScore.id,
          overallScore: rawScore.overallScore || 0,
          maxPossibleScore,
          criteriaScores,
          summary: rawScore.aiFeedback || '',
          scoredAt: rawScore.createdAt?.toISOString() || new Date().toISOString(),
        };
      }
      
      // Get related call legs if this call is part of a multi-leg session
      let relatedLegs: any[] = [];
      if (call.ringcentralSessionId) {
        const allLegs = await storage.getCallRecordingsBySessionId(call.ringcentralSessionId);
        // Filter out the current call and format for frontend
        relatedLegs = allLegs
          .filter(leg => leg.id !== call.id)
          .map(leg => ({
            id: leg.id,
            direction: leg.direction,
            durationSeconds: leg.durationSeconds,
            callStartTime: leg.callStartTime?.toISOString(),
            hasTranscript: !!leg.transcriptText,
            transcriptPreview: leg.transcriptText ? leg.transcriptText.substring(0, 100) + '...' : null,
          }));
      }
      
      res.json({ ...call, score, relatedLegs, isMultiLeg: relatedLegs.length > 0, legCount: relatedLegs.length + 1 });
    } catch (error: any) {
      console.error("Get call error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get merged transcript for all legs of a multi-leg call session
  app.get("/api/calls/:id/merged-transcript", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      if (!call.ringcentralSessionId) {
        return res.status(400).json({ message: "This call does not have a session ID for linking" });
      }
      
      // Role-based access control
      const user = req.user;
      const isAdminUser = await storage.isUserAdmin(user.id);
      if (!isAdminUser) {
        const prefs = await storage.getUserPreferences(user.id);
        if (prefs?.managedShopId) {
          if (call.shopId !== prefs.managedShopId) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else {
          if (call.userId !== user.id) {
            return res.status(403).json({ message: "Access denied" });
          }
        }
      }
      
      // Get all legs for this session
      const allLegs = await storage.getCallRecordingsBySessionId(call.ringcentralSessionId);
      
      // Merge transcripts chronologically
      const mergedTranscript = allLegs
        .filter(leg => leg.transcriptText)
        .map((leg, index) => ({
          legNumber: index + 1,
          callId: leg.id,
          direction: leg.direction,
          startTime: leg.callStartTime?.toISOString(),
          durationSeconds: leg.durationSeconds,
          transcript: leg.transcriptText,
        }));
      
      res.json({
        sessionId: call.ringcentralSessionId,
        legCount: allLegs.length,
        legs: mergedTranscript,
        fullTranscript: mergedTranscript.map(leg => 
          `--- Leg ${leg.legNumber} (${leg.direction}) ---\n${leg.transcript}`
        ).join('\n\n'),
      });
    } catch (error: any) {
      console.error("Get merged transcript error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Mark call as "not a sales call" (requires approval)
  app.patch("/api/calls/:id/not-sales-call", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const { isNotSalesCall, reason } = req.body;
      
      const call = await storage.getCallRecordingById(callId);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Role-based access control: admin/manager can mark any, user can mark their own
      const user = req.user;
      const isAdminUser = await storage.isUserAdmin(user.id);
      const userPrefs = await storage.getUserPreferences(user.id);
      const isManager = userPrefs?.isManager === true;
      
      if (!isAdminUser && !isManager) {
        if (call.userId !== user.id) {
          return res.status(403).json({ message: "You can only mark your own calls" });
        }
      }
      
      // Valid reasons for marking as not a sales call
      const validReasons = ['wrong_number', 'scheduling', 'vendor', 'internal', 'personal', 'other'];
      if (isNotSalesCall && reason && !validReasons.includes(reason)) {
        return res.status(400).json({ message: "Invalid reason. Must be one of: " + validReasons.join(', ') });
      }
      
      // Update the call record using storage method
      await storage.updateCallRecording(callId, {
        isNotSalesCall: isNotSalesCall === true,
        notSalesCallReason: isNotSalesCall ? (reason || 'other') : null,
      } as any);
      
      res.json({ 
        success: true, 
        isNotSalesCall: isNotSalesCall === true,
        reason: isNotSalesCall ? (reason || 'other') : null
      });
    } catch (error: any) {
      console.error("Mark not-sales-call error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Score a call transcript with AI (admin only)
  app.post("/api/calls/:id/score", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Use transcriptText (plain text version) for scoring
      const transcriptText = call.transcriptText as string | null;
      if (!transcriptText || transcriptText.trim().length < 50) {
        return res.status(400).json({ message: "Call does not have a transcript to score" });
      }
      
      // Get active coaching criteria for this call type
      const callType = call.callType || 'sales';
      const criteria = await storage.getActiveCoachingCriteria(undefined, callType);
      
      if (criteria.length === 0) {
        return res.status(400).json({ message: `No active coaching criteria defined for ${callType} calls` });
      }
      
      // Score the transcript with AI
      const scoringResult = await scoreCallTranscript(transcriptText, criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        category: c.category,
        maxScore: 5, // Each criterion is scored 0-5
        isActive: c.isActive || true,
      })));
      
      // Check if score already exists
      const existingScore = await storage.getCallScore(callId);
      
      let savedScore;
      if (existingScore) {
        // Update existing score
        savedScore = await storage.updateCallScore(existingScore.id, {
          overallScore: scoringResult.overallScore,
          criteriaScores: scoringResult.criteriaScores,
          aiFeedback: scoringResult.summary,
          aiHighlights: scoringResult.highlights,
        });
      } else {
        // Create new score
        savedScore = await storage.createCallScore({
          callId,
          overallScore: scoringResult.overallScore,
          criteriaScores: scoringResult.criteriaScores,
          aiFeedback: scoringResult.summary,
          aiHighlights: scoringResult.highlights,
        });
      }
      
      res.json({
        success: true,
        score: {
          id: savedScore.id,
          overallScore: scoringResult.overallScore,
          criteriaScores: Object.entries(scoringResult.criteriaScores).map(([criterionId, data]) => {
            const criterion = criteria.find(c => c.id === criterionId);
            return {
              criterionId,
              criterionName: criterion?.name || 'Unknown',
              score: data.score,
              maxScore: 5,
              found: data.found,
              excerpts: data.excerpts,
            };
          }),
          summary: scoringResult.summary,
          highlights: scoringResult.highlights,
        },
      });
    } catch (error: any) {
      console.error("Score call error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get count of unscored sales calls (admin only)
  app.get("/api/calls/unscored/count", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Use a smaller limit for counting since we just need to know if there are any
      const unscoredCalls = await storage.getUnscoredCallRecordings(100, true);
      res.json({ 
        count: unscoredCalls.length,
        message: unscoredCalls.length > 0 
          ? `${unscoredCalls.length}${unscoredCalls.length === 100 ? '+' : ''} sales calls ready for scoring`
          : "All sales calls have been scored"
      });
    } catch (error: any) {
      console.error("Get unscored count error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Batch score unscored sales calls (admin only)
  app.post("/api/calls/score-batch", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50); // Max 50 per batch
      
      // Get unscored sales calls
      const unscoredCalls = await storage.getUnscoredCallRecordings(limit, true);
      
      if (unscoredCalls.length === 0) {
        return res.json({ 
          success: true, 
          scored: 0, 
          message: "No unscored sales calls found" 
        });
      }
      
      const results = {
        scored: 0,
        failed: 0,
        errors: [] as string[],
      };
      
      // Score each call (with rate limiting - 1 second between calls)
      for (const call of unscoredCalls) {
        try {
          const transcriptText = call.transcriptText as string;
          
          // Get active coaching criteria for this call's type
          const callType = call.callType || 'sales';
          const criteria = await storage.getActiveCoachingCriteria(undefined, callType);
          
          if (criteria.length === 0) {
            results.failed++;
            results.errors.push(`Call ${call.id}: No criteria defined for ${callType} calls`);
            continue;
          }
          
          // Score the transcript with AI
          const scoringResult = await scoreCallTranscript(transcriptText, criteria.map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            category: c.category,
            maxScore: 5,
            isActive: c.isActive || true,
          })));
          
          // Save the score
          await storage.createCallScore({
            callId: call.id,
            overallScore: scoringResult.overallScore,
            criteriaScores: scoringResult.criteriaScores,
            aiFeedback: scoringResult.summary,
            aiHighlights: scoringResult.highlights,
          });
          
          results.scored++;
          
          // Rate limit: wait 1 second between API calls to avoid overwhelming OpenAI
          if (results.scored < unscoredCalls.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (err: any) {
          results.failed++;
          results.errors.push(`Call ${call.id}: ${err.message}`);
          console.error(`Failed to score call ${call.id}:`, err.message);
        }
      }
      
      res.json({
        success: true,
        scored: results.scored,
        failed: results.failed,
        errors: results.errors.slice(0, 5), // Only return first 5 errors
        message: `Scored ${results.scored} of ${unscoredCalls.length} sales calls`,
      });
    } catch (error: any) {
      console.error("Batch score error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Stream call recording audio (requires approval)
  app.get("/api/calls/:id/recording", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const call = await storage.getCallRecordingById(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Role-based access control: admin sees all, manager sees shop, user sees own
      const user = req.user;
      const isAdminUser = await storage.isUserAdmin(user.id);
      if (!isAdminUser) {
        const prefs = await storage.getUserPreferences(user.id);
        if (prefs?.managedShopId) {
          // Manager: can only access recordings from their shop
          if (call.shopId !== prefs.managedShopId) {
            return res.status(403).json({ message: "Access denied: this recording is not from your shop" });
          }
        } else {
          // Regular user: can only access their own recordings
          if (call.userId !== user.id) {
            return res.status(403).json({ message: "Access denied: you can only access your own recordings" });
          }
        }
      }
      
      if (!call.ringcentralRecordingId) {
        return res.status(404).json({ message: "No recording available for this call" });
      }
      
      // Fetch recording content from RingCentral
      const { fetchRecordingContent } = await import("./ringcentral");
      const audioBuffer = await fetchRecordingContent(call.ringcentralRecordingId);
      
      // Set appropriate headers for audio streaming
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=3600");
      
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("Get recording error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch recording" });
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

  // ==========================================
  // Transcript Annotation Routes (Admin/Manager only)
  // ==========================================
  
  // Get annotations for a call
  app.get("/api/calls/:id/annotations", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const callId = req.params.id;
      const annotations = await storage.getAnnotationsForCall(callId);
      res.json(annotations);
    } catch (error: any) {
      console.error("Get annotations error:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Create a transcript annotation
  app.post("/api/calls/:id/annotations", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Only admins and managers can add annotations
      if (!isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied. Admin or manager role required to add annotations." });
      }
      
      const callId = req.params.id;
      const data = {
        ...req.body,
        callId,
        createdBy: user.id,
      };
      
      const annotation = await storage.createTranscriptAnnotation(data);
      res.json(annotation);
    } catch (error: any) {
      console.error("Create annotation error:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Update a transcript annotation
  app.patch("/api/calls/:callId/annotations/:id", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Only admins and managers can update annotations
      if (!isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied. Admin or manager role required." });
      }
      
      const annotation = await storage.updateTranscriptAnnotation(req.params.id, req.body);
      res.json(annotation);
    } catch (error: any) {
      console.error("Update annotation error:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Delete a transcript annotation
  app.delete("/api/calls/:callId/annotations/:id", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Only admins and managers can delete annotations
      if (!isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied. Admin or manager role required." });
      }
      
      await storage.deleteTranscriptAnnotation(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete annotation error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Coaching Dashboard - Team Overview (admin/manager only)
  app.get("/api/coaching/dashboard", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Only admins and managers can view dashboard
      if (!isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied. Admin or manager role required." });
      }
      
      const { dateFrom, dateTo } = req.query;
      const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
      const toDate = dateTo ? new Date(dateTo as string) : undefined;
      
      const stats = await storage.getTeamDashboardStats(fromDate, toDate);
      res.json(stats);
    } catch (error: any) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Coaching Dashboard - Individual User Stats (admin/manager or self)
  app.get("/api/coaching/dashboard/user/:userId", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const { userId } = req.params;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Users can view their own stats, admins/managers can view anyone's
      if (userId !== user.id && !isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied." });
      }
      
      const { dateFrom, dateTo } = req.query;
      const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
      const toDate = dateTo ? new Date(dateTo as string) : undefined;
      
      const stats = await storage.getUserDashboardStats(userId, fromDate, toDate);
      res.json(stats);
    } catch (error: any) {
      console.error("User dashboard error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Coaching Dashboard - Criteria Performance (admin/manager only)
  app.get("/api/coaching/dashboard/criteria", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Only admins and managers can view criteria breakdown
      if (!isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied. Admin or manager role required." });
      }
      
      const { dateFrom, dateTo } = req.query;
      const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
      const toDate = dateTo ? new Date(dateTo as string) : undefined;
      
      const stats = await storage.getCriteriaDashboardStats(fromDate, toDate);
      res.json(stats);
    } catch (error: any) {
      console.error("Criteria dashboard error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Training Recommendations - AI-powered personalized coaching (admin/manager or self)
  app.get("/api/coaching/recommendations/:userId", isAuthenticated, isApproved, async (req: any, res) => {
    try {
      const user = req.user;
      const { userId } = req.params;
      const prefs = await storage.getUserPreferences(user.id);
      const isAdminUser = await storage.isUserAdmin(user.id);
      
      // Users can view their own recommendations, admins/managers can view anyone's
      if (userId !== user.id && !isAdminUser && !prefs?.isManager) {
        return res.status(403).json({ message: "Access denied." });
      }
      
      // Get user's name for personalized recommendations
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const userName = targetUser.firstName && targetUser.lastName 
        ? `${targetUser.firstName} ${targetUser.lastName}` 
        : targetUser.email || 'Service Advisor';
      
      // Get date range (default to last 90 days for comprehensive analysis)
      const { dateFrom, dateTo } = req.query;
      const fromDate = dateFrom 
        ? new Date(dateFrom as string) 
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const toDate = dateTo ? new Date(dateTo as string) : new Date();
      
      // Get user's dashboard stats with criteria averages
      const userStats = await storage.getUserDashboardStats(userId, fromDate, toDate);
      
      // Need at least 3 scored calls for meaningful recommendations
      if (userStats.scoredCount < 3) {
        return res.json({
          recommendations: [],
          overallAssessment: "Not enough scored calls to generate recommendations. At least 3 scored calls are needed for meaningful analysis.",
          strengths: [],
          nextSteps: "Continue making calls and ensure they are being scored by a manager.",
          minimumCallsRequired: 3,
          currentScoredCalls: userStats.scoredCount,
        });
      }
      
      // Get all coaching criteria for descriptions
      const allCriteria = await storage.getAllCoachingCriteria();
      const criteriaMap = new Map(allCriteria.map(c => [c.id, c]));
      
      // Build criteria performance data
      const criteriaPerformance = Object.entries(userStats.criteriaAverages).map(([id, data]) => ({
        id,
        name: data.name,
        description: criteriaMap.get(id)?.description || null,
        averageScore: data.average,
        callCount: data.count,
      }));
      
      // Prepare recent scores for trend analysis
      const recentScores = userStats.recentScores.map(s => ({
        callId: s.callId,
        score: s.score,
        callDate: s.callDate.toISOString(),
      }));
      
      // Generate AI-powered recommendations
      const recommendations = await generateTrainingRecommendations(
        userName,
        criteriaPerformance,
        recentScores
      );
      
      res.json({
        ...recommendations,
        stats: {
          callCount: userStats.callCount,
          scoredCount: userStats.scoredCount,
          averageScore: userStats.averageScore,
          dateFrom: fromDate.toISOString(),
          dateTo: toDate.toISOString(),
        }
      });
    } catch (error: any) {
      console.error("Training recommendations error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
