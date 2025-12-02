/**
 * Vehicle model normalization utilities
 * Handles variations in model names (F150 vs F-150, Silverado 1500 vs 1500, etc.)
 */

// Common model name aliases grouped by normalized form
// Key: normalized form (lowercase, no spaces/hyphens)
// Value: array of common variations
const MODEL_ALIASES: Record<string, string[]> = {
  // Ford
  'f150': ['F-150', 'F150', 'F 150'],
  'f250': ['F-250', 'F250', 'F 250'],
  'f350': ['F-350', 'F350', 'F 350'],
  'f450': ['F-450', 'F450', 'F 450'],
  'f550': ['F-550', 'F550', 'F 550'],
  // Chevrolet/GMC
  'silverado1500': ['Silverado 1500', '1500 Silverado', 'Silverado-1500'],
  'silverado2500': ['Silverado 2500', '2500 Silverado', 'Silverado-2500', 'Silverado 2500HD', '2500HD'],
  'silverado3500': ['Silverado 3500', '3500 Silverado', 'Silverado-3500', 'Silverado 3500HD', '3500HD'],
  'sierra1500': ['Sierra 1500', '1500 Sierra', 'Sierra-1500'],
  'sierra2500': ['Sierra 2500', '2500 Sierra', 'Sierra-2500', 'Sierra 2500HD'],
  'sierra3500': ['Sierra 3500', '3500 Sierra', 'Sierra-3500', 'Sierra 3500HD'],
  // RAM
  'ram1500': ['RAM 1500', 'Ram 1500', '1500 Ram', 'RAM-1500', 'Dodge Ram 1500'],
  'ram2500': ['RAM 2500', 'Ram 2500', '2500 Ram', 'RAM-2500', 'Dodge Ram 2500'],
  'ram3500': ['RAM 3500', 'Ram 3500', '3500 Ram', 'RAM-3500', 'Dodge Ram 3500'],
  // Toyota
  '4runner': ['4Runner', '4-Runner', 'Four Runner', 'Forerunner'],
  'landcruiser': ['Land Cruiser', 'LandCruiser', 'Land-Cruiser'],
  'rav4': ['RAV4', 'RAV-4', 'Rav4', 'Rav 4'],
  'gr86': ['GR86', 'GR-86', 'GR 86'],
  'bz4x': ['bZ4X', 'BZ4X', 'bZ-4X'],
  // Honda
  'crv': ['CR-V', 'CRV', 'CR V'],
  'hrv': ['HR-V', 'HRV', 'HR V'],
  'brv': ['BR-V', 'BRV', 'BR V'],
  // Mazda
  'cx5': ['CX-5', 'CX5', 'CX 5'],
  'cx9': ['CX-9', 'CX9', 'CX 9'],
  'cx30': ['CX-30', 'CX30', 'CX 30'],
  'cx50': ['CX-50', 'CX50', 'CX 50'],
  'cx90': ['CX-90', 'CX90', 'CX 90'],
  'mx5': ['MX-5', 'MX5', 'MX 5', 'Miata MX-5', 'Miata'],
  // Subaru
  'wrx': ['WRX', 'Impreza WRX', 'WRX STI'],
  'brz': ['BRZ', 'BR-Z'],
  // Mercedes
  'cclass': ['C-Class', 'C Class', 'CClass'],
  'eclass': ['E-Class', 'E Class', 'EClass'],
  'sclass': ['S-Class', 'S Class', 'SClass'],
  'gclass': ['G-Class', 'G Class', 'GClass', 'G Wagon', 'G-Wagon'],
  'glc': ['GLC', 'GLC-Class'],
  'gle': ['GLE', 'GLE-Class'],
  'gls': ['GLS', 'GLS-Class'],
  // BMW
  '3series': ['3 Series', '3-Series', '3Series'],
  '5series': ['5 Series', '5-Series', '5Series'],
  '7series': ['7 Series', '7-Series', '7Series'],
  'x3': ['X3', 'X-3'],
  'x5': ['X5', 'X-5'],
  // Lexus
  'rx350': ['RX350', 'RX 350', 'RX-350'],
  'rx450': ['RX450', 'RX 450', 'RX-450', 'RX450h', 'RX 450h'],
  'nx350': ['NX350', 'NX 350', 'NX-350'],
  'es350': ['ES350', 'ES 350', 'ES-350'],
  // Volkswagen
  'gti': ['GTI', 'Golf GTI'],
  'gli': ['GLI', 'Jetta GLI'],
  'id4': ['ID.4', 'ID4', 'ID 4'],
  // General patterns
  'grandcherokee': ['Grand Cherokee', 'GrandCherokee', 'Grand-Cherokee'],
  'grandcaravan': ['Grand Caravan', 'GrandCaravan', 'Grand-Caravan'],
};

// Build reverse lookup: from any alias to normalized form
const ALIAS_TO_NORMALIZED: Map<string, string> = new Map();
for (const [normalized, aliases] of Object.entries(MODEL_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_NORMALIZED.set(alias.toLowerCase().replace(/[\s-]/g, ''), normalized);
  }
  // Also map the normalized form to itself
  ALIAS_TO_NORMALIZED.set(normalized, normalized);
}

/**
 * Normalizes a vehicle model name by:
 * 1. Converting to lowercase
 * 2. Removing hyphens and spaces
 * 3. Looking up known aliases
 * 
 * @param model The vehicle model name to normalize
 * @returns The normalized model name (lowercase, no spaces/hyphens)
 */
export function normalizeModel(model: string): string {
  if (!model) return '';
  
  // First, strip to alphanumeric only (lowercase)
  const stripped = model.toLowerCase().replace(/[\s\-]/g, '');
  
  // Check if this is a known alias
  const normalized = ALIAS_TO_NORMALIZED.get(stripped);
  if (normalized) {
    return normalized;
  }
  
  // Return the stripped version if no alias found
  return stripped;
}

/**
 * Gets all search variations for a model name.
 * This is used to search the database with multiple patterns.
 * 
 * @param model The vehicle model name
 * @returns Array of model variations to search for
 */
export function getModelVariations(model: string): string[] {
  if (!model) return [];
  
  const normalized = normalizeModel(model);
  const variations = new Set<string>();
  
  // Add the original input
  variations.add(model);
  
  // Add the normalized form
  variations.add(normalized);
  
  // If this normalized form has known aliases, add them all
  if (MODEL_ALIASES[normalized]) {
    for (const alias of MODEL_ALIASES[normalized]) {
      variations.add(alias);
    }
  }
  
  // Generate common variations from the input
  // If model contains hyphens, add version without
  if (model.includes('-')) {
    variations.add(model.replace(/-/g, ''));
    variations.add(model.replace(/-/g, ' '));
  }
  
  // If model is all-together (like F150), add hyphenated version
  const letterNumberMatch = model.match(/^([A-Za-z]+)(\d+)$/);
  if (letterNumberMatch) {
    const [, letters, numbers] = letterNumberMatch;
    variations.add(`${letters}-${numbers}`);
    variations.add(`${letters} ${numbers}`);
  }
  
  // If model has spaces, add version without
  if (model.includes(' ')) {
    variations.add(model.replace(/\s+/g, ''));
    variations.add(model.replace(/\s+/g, '-'));
  }
  
  return Array.from(variations);
}

/**
 * Generates SQL patterns for model matching.
 * Returns patterns suitable for ILIKE queries.
 * 
 * @param model The vehicle model to search for
 * @returns Array of SQL patterns (e.g., ['%F-150%', '%F150%', '%F 150%'])
 */
export function getModelSearchPatterns(model: string): string[] {
  const variations = getModelVariations(model);
  return variations.map(v => `%${v}%`);
}

/**
 * Normalizes make name for consistency
 */
export function normalizeMake(make: string): string {
  if (!make) return '';
  return make.trim().toLowerCase();
}

/**
 * Cleans up vehicle model from Tekmetric API data
 * Removes excess trim info, standardizes format
 */
export function cleanVehicleModel(model: string): string {
  if (!model) return '';
  
  // Common trim levels to strip
  const trimPatterns = [
    /\s+(XLE|LE|SE|XSE|Limited|Sport|Premium|Touring|EX|LX|DX|SV|SL|SR|Platinum|Denali|LTZ|LT|LS|L|S|High Country|King Ranch|Lariat|STX|Big Horn|Laramie|Rebel|TRD|Off-Road|Trail|Base|Value|Classic|Work Truck|WT)$/i,
    /\s+\d+\.\d+L$/i, // Engine size like "3.5L"
    /\s+V\d$/i,        // Engine type like "V6"
    /\s+(AWD|4WD|2WD|FWD|RWD)$/i, // Drive type
    /\s+(Crew Cab|Extended Cab|Regular Cab|Double Cab|Quad Cab|SuperCrew|SuperCab)$/i, // Truck cab types
    /\s+(Short Bed|Long Bed|Standard Bed)$/i, // Truck bed types
  ];
  
  let cleaned = model.trim();
  
  // Apply each pattern in order
  for (const pattern of trimPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  
  return cleaned;
}
