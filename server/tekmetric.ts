import { JobWithDetails } from "@shared/schema";

const TEKMETRIC_BASE_URL = "https://shop.tekmetric.com/api/v1";

export type ShopLocation = "NB" | "WM" | "EV";

export const SHOP_NAMES: Record<ShopLocation, string> = {
  NB: "Northbrook",
  WM: "Wilmette",
  EV: "Evanston",
};

function getShopId(location: ShopLocation): string | undefined {
  const envVars: Record<ShopLocation, string> = {
    NB: process.env.TM_SHOP_ID_NB || "",
    WM: process.env.TM_SHOP_ID_WM || "",
    EV: process.env.TM_SHOP_ID_EV || "",
  };
  return envVars[location] || undefined;
}

function getApiKey(): string | undefined {
  return process.env.TEKMETRIC_API_KEY;
}

export function isTekmetricConfigured(shopLocation?: ShopLocation): boolean {
  const apiKey = getApiKey();
  if (!apiKey) return false;
  
  if (shopLocation) {
    return !!getShopId(shopLocation);
  }
  
  return !!(getShopId("NB") || getShopId("WM") || getShopId("EV"));
}

export function getAvailableShops(): ShopLocation[] {
  const shops: ShopLocation[] = [];
  if (getShopId("NB")) shops.push("NB");
  if (getShopId("WM")) shops.push("WM");
  if (getShopId("EV")) shops.push("EV");
  return shops;
}

async function tekmetricRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
  shopLocation?: ShopLocation
): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Tekmetric API key not configured");
  }

  const shopId = shopLocation ? getShopId(shopLocation) : undefined;
  
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (shopId) {
    headers["X-Shop-Id"] = shopId;
  }

  const url = `${TEKMETRIC_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tekmetric API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function createTekmetricEstimate(
  job: JobWithDetails,
  shopLocation: ShopLocation,
  customerId?: number,
  vehicleId?: number,
  repairOrderId?: string
): Promise<{ repairOrderId: string; url: string }> {
  const laborItems = job.laborItems.map((labor) => ({
    name: labor.name,
    laborTime: labor.hours,
    laborRate: labor.rate,
    technicianId: labor.technicianId,
  }));

  const parts = job.parts.map((part) => ({
    name: part.name,
    partNumber: part.partNumber || "",
    cost: part.cost,
    quantity: part.quantity || 1,
    retail: part.retail || part.cost,
  }));

  const jobData = {
    name: job.name,
    authorized: false,
    laborItems,
    parts,
    note: `Imported from historical job #${job.id}`,
  };

  let targetRepairOrderId: string;
  
  if (repairOrderId) {
    const payload = {
      jobs: [jobData],
    };
    
    await tekmetricRequest(`/repair-orders/${repairOrderId}`, "PATCH", payload, shopLocation);
    targetRepairOrderId = repairOrderId;
  } else {
    const payload = {
      customerId,
      vehicleId,
      jobs: [jobData],
    };

    const result = await tekmetricRequest("/repair-orders", "POST", payload, shopLocation);
    targetRepairOrderId = result.id.toString();
  }
  
  const shopId = getShopId(shopLocation);
  const repairOrderUrl = `https://shop.tekmetric.com/shop/${shopId}/repair-orders/${targetRepairOrderId}`;

  return {
    repairOrderId: targetRepairOrderId,
    url: repairOrderUrl,
  };
}

export async function testConnection(shopLocation: ShopLocation): Promise<boolean> {
  try {
    await tekmetricRequest("/shops", "GET", undefined, shopLocation);
    return true;
  } catch (error) {
    console.error("Tekmetric connection test failed:", error);
    return false;
  }
}

export async function fetchCurrentPricing(
  partNumbers: string[],
  shopLocation: ShopLocation
): Promise<Record<string, { cost: number; retail: number }>> {
  const results: Record<string, { cost: number; retail: number }> = {};
  
  for (const partNumber of partNumbers) {
    try {
      const response = await tekmetricRequest(
        `/parts/search?query=${encodeURIComponent(partNumber)}`,
        "GET",
        undefined,
        shopLocation
      );
      
      if (response.items && response.items.length > 0) {
        const part = response.items[0];
        results[partNumber] = {
          cost: part.cost || 0,
          retail: part.retail || part.cost || 0,
        };
      }
    } catch (error) {
      console.error(`Failed to fetch pricing for ${partNumber}:`, error);
    }
  }
  
  return results;
}

// Fetch repair order details from Tekmetric API
export async function fetchRepairOrder(
  roId: string,
  shopId: string
): Promise<{
  id: string;
  roNumber: string;
  customer: { id: number; firstName: string; lastName: string } | null;
  vehicle: { id: number; year: number; make: string; model: string; engine?: string; vin?: string } | null;
  jobs: Array<{ id: number; name: string; authorized: boolean }>;
} | null> {
  try {
    // Determine shop location from shop ID
    const shopLocation = getShopLocationFromId(shopId);
    if (!shopLocation) {
      console.error(`Unknown shop ID: ${shopId}`);
      return null;
    }
    
    const response = await tekmetricRequest(`/repair-orders/${roId}`, "GET", undefined, shopLocation);
    
    return {
      id: response.id?.toString() || roId,
      roNumber: response.repairOrderNumber || response.roNumber || `RO-${roId}`,
      customer: response.customer ? {
        id: response.customer.id,
        firstName: response.customer.firstName || '',
        lastName: response.customer.lastName || '',
      } : null,
      vehicle: response.vehicle ? {
        id: response.vehicle.id,
        year: response.vehicle.year,
        make: response.vehicle.make,
        model: response.vehicle.model,
        engine: response.vehicle.engineSize || response.vehicle.engine,
        vin: response.vehicle.vin,
      } : null,
      jobs: (response.jobs || []).map((job: any) => ({
        id: job.id,
        name: job.name,
        authorized: job.authorized || false,
      })),
    };
  } catch (error) {
    console.error(`Failed to fetch RO ${roId}:`, error);
    return null;
  }
}

// Helper to get shop location from numeric shop ID
function getShopLocationFromId(shopId: string): ShopLocation | null {
  const nbId = process.env.TM_SHOP_ID_NB;
  const wmId = process.env.TM_SHOP_ID_WM;
  const evId = process.env.TM_SHOP_ID_EV;
  
  if (shopId === nbId) return "NB";
  if (shopId === wmId) return "WM";
  if (shopId === evId) return "EV";
  
  return null;
}

// Fetch all employees from Tekmetric for a shop
export interface TekmetricEmployee {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
  isActive?: boolean;
}

export async function fetchEmployees(shopLocation: ShopLocation): Promise<TekmetricEmployee[]> {
  try {
    const shopId = getShopId(shopLocation);
    if (!shopId) {
      console.error(`No shop ID configured for ${shopLocation}`);
      return [];
    }
    
    // Use shop query parameter like other Tekmetric endpoints (Customers, etc.)
    // Don't pass shopLocation to avoid adding X-Shop-Id header - just use query param
    const response = await tekmetricRequest(`/employees?shop=${shopId}`, "GET");
    const employees = response.content || response.items || response || [];
    
    return employees.map((emp: any) => ({
      id: emp.id,
      firstName: emp.firstName || emp.first_name || '',
      lastName: emp.lastName || emp.last_name || '',
      email: emp.email,
      role: emp.role?.name || emp.roleName || emp.role,
      isActive: emp.active !== false && emp.isActive !== false,
    }));
  } catch (error) {
    console.error(`Failed to fetch employees for ${shopLocation}:`, error);
    return [];
  }
}

// Get employee name by ID (uses cache if available)
const employeeCache = new Map<number, TekmetricEmployee>();
let employeeCacheInitialized = false;
let employeeCachePromise: Promise<void> | null = null;

async function initializeEmployeeCache(): Promise<void> {
  if (employeeCacheInitialized) return;
  if (employeeCachePromise) return employeeCachePromise;
  
  employeeCachePromise = (async () => {
    console.log('Initializing employee cache from all shops...');
    const shops = getAvailableShops();
    
    for (const shop of shops) {
      const employees = await fetchEmployees(shop);
      for (const emp of employees) {
        employeeCache.set(emp.id, emp);
      }
    }
    
    console.log(`Employee cache initialized with ${employeeCache.size} employees`);
    employeeCacheInitialized = true;
  })();
  
  return employeeCachePromise;
}

export async function getEmployeeName(employeeId: number, shopLocation?: ShopLocation): Promise<string | null> {
  // Check cache first
  if (employeeCache.has(employeeId)) {
    const emp = employeeCache.get(employeeId)!;
    return `${emp.firstName} ${emp.lastName}`.trim() || null;
  }
  
  // Initialize cache if not done yet (batches all shop fetches)
  await initializeEmployeeCache();
  
  // Check cache again after initialization
  if (employeeCache.has(employeeId)) {
    const emp = employeeCache.get(employeeId)!;
    return `${emp.firstName} ${emp.lastName}`.trim() || null;
  }
  
  // Employee not found in any shop
  return null;
}
