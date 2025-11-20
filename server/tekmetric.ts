import { JobWithDetails } from "@shared/schema";

const TEKMETRIC_BASE_URL = "https://sandbox.tekmetric.com/api/v1";

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
  vehicleId?: number
): Promise<{ repairOrderId: number; url: string }> {
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

  const payload = {
    customerId,
    vehicleId,
    jobs: [
      {
        name: job.name,
        authorized: false,
        laborItems,
        parts,
        note: `Imported from historical job #${job.id}`,
      },
    ],
  };

  const result = await tekmetricRequest("/repair-orders", "POST", payload, shopLocation);
  
  const shopId = getShopId(shopLocation);
  const repairOrderUrl = `https://shop.tekmetric.com/shop/${shopId}/repair-orders/${result.id}`;

  return {
    repairOrderId: result.id,
    url: repairOrderUrl,
  };
}

export async function testConnection(shopLocation: ShopLocation): Promise<boolean> {
  try {
    await tekmetricRequest("/shops/current", "GET", undefined, shopLocation);
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
