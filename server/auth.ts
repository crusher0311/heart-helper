import bcrypt from "bcryptjs";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { Resend } from "resend";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,  // Auto-create sessions table if it doesn't exist
    ttl: sessionTtl,
    tableName: "sessions",
  });
  const isProduction = process.env.NODE_ENV === 'production';
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: sessionTtl,
    },
  });
}

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ message: "Password not set. Please contact an administrator." });
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Update last login
      await storage.updateUserLastLogin(user.id);
      
      // Check and upgrade bootstrap admins on login
      const normalizedEmail = email.toLowerCase().trim();
      await storage.ensureUserPreferencesOnLogin(user.id, normalizedEmail);
      
      // Get user with preferences (after potential upgrade)
      const userWithPrefs = await storage.getUserWithPreferences(user.id);
      
      // Regenerate session to prevent session fixation attacks, then set userId
      return new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            console.error("Session regeneration error:", err);
            return res.status(500).json({ message: "Login failed" });
          }
          
          // Set session after regeneration
          req.session.userId = user.id;
          
          // Save the session before responding
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
              return res.status(500).json({ message: "Login failed" });
            }
            
            res.json({ 
              message: "Login successful",
              user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                profileImageUrl: user.profileImageUrl,
              },
              preferences: userWithPrefs?.preferences,
            });
            resolve();
          });
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // Register endpoint
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await storage.createUserWithPassword({
        email: normalizedEmail,
        passwordHash,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
      });

      // Ensure user preferences exist with appropriate approval status
      await storage.ensureUserPreferencesOnLogin(user.id, normalizedEmail);

      // Get user with preferences
      const userWithPrefs = await storage.getUserWithPreferences(user.id);

      // Regenerate session to prevent session fixation attacks, then set userId
      return new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            console.error("Session regeneration error:", err);
            return res.status(500).json({ message: "Registration failed" });
          }
          
          // Set session after regeneration
          req.session.userId = user.id;
          
          // Save the session before responding
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
              return res.status(500).json({ message: "Registration failed" });
            }
            
            res.status(201).json({ 
              message: "Registration successful",
              user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
              },
              preferences: userWithPrefs?.preferences,
            });
            resolve();
          });
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // Forgot password endpoint - sends reset email
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      // Always return success to prevent email enumeration attacks
      if (!user) {
        console.log(`[Forgot Password] No user found for email: ${email}`);
        return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
      }

      // Check if RESEND_API_KEY is configured
      if (!process.env.RESEND_API_KEY) {
        console.error("[Forgot Password] RESEND_API_KEY not configured");
        return res.status(500).json({ message: "Email service not configured. Please contact an administrator." });
      }

      // Invalidate any existing tokens for this user
      await storage.invalidateUserPasswordResetTokens(user.id);

      // Create a new reset token
      const resetToken = await storage.createPasswordResetToken(user.id);

      // Build the reset URL
      const baseUrl = process.env.APP_URL || `https://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken.token}`;

      // Send the email using Resend
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      
      await resend.emails.send({
        from: `HEART Helper <${fromEmail}>`,
        to: user.email!,
        subject: 'Reset Your Password - HEART Helper',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e3a5f;">Reset Your Password</h2>
            <p>Hi ${user.firstName || 'there'},</p>
            <p>We received a request to reset your password for your HEART Helper account.</p>
            <p>Click the button below to set a new password:</p>
            <p style="margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #1e3a5f; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">
              This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              HEART Certified Auto Care
            </p>
          </div>
        `,
      });

      console.log(`[Forgot Password] Reset email sent to ${user.email}`);
      return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Reset password endpoint - validates token and updates password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Get the reset token
      const resetToken = await storage.getPasswordResetToken(token);
      
      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      // Check if token has been used
      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }

      // Check if token is expired
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({ message: "This reset link has expired" });
      }

      // Hash the new password and update
      const passwordHash = await hashPassword(password);
      await storage.updateUserPassword(resetToken.userId, passwordHash);

      // Invalidate ALL tokens for this user (not just the one used)
      // This ensures any other outstanding tokens are also revoked
      await storage.invalidateUserPasswordResetTokens(resetToken.userId);

      console.log(`[Reset Password] Password reset successful for user ${resetToken.userId}`);
      return res.json({ message: "Password reset successful. You can now log in with your new password." });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user endpoint
  app.get("/api/auth/user", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      // Include isAdmin from user preferences
      const isAdmin = await storage.isUserAdmin(userId);

      return res.json({ ...user, isAdmin });
    } catch (error) {
      console.error("Get user error:", error);
      return res.status(500).json({ message: "Failed to get user" });
    }
  });
}

// Middleware to check if user is authenticated
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Attach user to request for downstream handlers
  (req as any).user = user;
  return next();
};

// Middleware to check if user is approved (for protected routes)
export const isApproved: RequestHandler = async (req, res, next) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const approved = await storage.isUserApproved(userId);
  if (!approved) {
    return res.status(403).json({ message: "Account pending approval", code: "PENDING_APPROVAL" });
  }
  
  return next();
};
