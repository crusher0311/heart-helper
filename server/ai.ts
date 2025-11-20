// Reference: javascript_openai_ai_integrations blueprint
import OpenAI from "openai";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

interface JobMatch {
  jobId: number;
  matchScore: number;
  matchReason: string;
}

interface SearchContext {
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleEngine?: string;
  repairType: string;
}

interface JobCandidate {
  id: number;
  name: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleEngine?: string;
  jobCategory?: string;
  laborHours?: string;
  partsCount: number;
  totalCost: number;
}

/**
 * Uses AI to score and rank job candidates based on similarity to search criteria
 * Returns matches with scores and reasoning
 */
/**
 * Uses AI to determine which model years are mechanically compatible
 * based on powertrain, platform, and repair type
 */
export async function getCompatibleYears(
  vehicleMake: string,
  vehicleModel: string,
  vehicleYear: number,
  vehicleEngine?: string,
  repairType?: string
): Promise<number[]> {
  const prompt = `You are an automotive expert. Determine which model years of the ${vehicleYear} ${vehicleMake} ${vehicleModel} are mechanically compatible for repair purposes.

Vehicle Details:
- Year: ${vehicleYear}
- Make: ${vehicleMake}
- Model: ${vehicleModel}
${vehicleEngine ? `- Engine: ${vehicleEngine}` : ""}
${repairType ? `- Repair Type: ${repairType}` : ""}

Consider:
1. Powertrain compatibility (same engine/transmission across years)
2. Platform generations (when did major redesigns happen?)
3. Component interchangeability for this repair type
4. Mid-cycle refreshes that changed mechanical components

Return ONLY years within ±5 years of ${vehicleYear} (${vehicleYear - 5} to ${vehicleYear + 5}) that share:
- Same or very similar powertrain
- Compatible parts for the specified repair type
- Same platform/generation

Return ONLY valid JSON:
{
  "compatibleYears": [2016, 2017, 2018, 2019, 2020],
  "reasoning": "Brief explanation of why these years are compatible"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an automotive expert specializing in vehicle platform generations and powertrain compatibility. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    
    if (parsed.compatibleYears && Array.isArray(parsed.compatibleYears)) {
      console.log(`AI year compatibility: ${parsed.compatibleYears.join(', ')} - ${parsed.reasoning}`);
      
      // Coerce to numbers and filter valid years
      const aiYears = parsed.compatibleYears
        .map((year: any) => typeof year === 'number' ? year : parseInt(String(year), 10))
        .filter((year: number) => 
          !isNaN(year) && 
          year >= vehicleYear - 5 && 
          year <= vehicleYear + 5
        );
      
      // If AI returned empty or doesn't include original year, blend in fallback
      if (aiYears.length === 0) {
        console.log("AI returned no valid years, using ±2 fallback");
        return [
          vehicleYear - 2,
          vehicleYear - 1,
          vehicleYear,
          vehicleYear + 1,
          vehicleYear + 2
        ];
      }
      
      // Ensure original year is included and deduplicate
      const allYears = Array.from(new Set([...aiYears, vehicleYear])).sort((a, b) => a - b);
      return allYears;
    }
    
    throw new Error("Invalid response format");
  } catch (error) {
    console.error("AI year compatibility error:", error);
    // Fallback to ±2 years
    return [
      vehicleYear - 2,
      vehicleYear - 1,
      vehicleYear,
      vehicleYear + 1,
      vehicleYear + 2
    ];
  }
}

/**
 * Uses AI to score and rank job candidates based on similarity to search criteria
 * Returns matches with scores and reasoning
 */
export async function scoreJobMatches(
  searchContext: SearchContext,
  candidates: JobCandidate[]
): Promise<JobMatch[]> {
  if (candidates.length === 0) {
    return [];
  }

  const prompt = `You are an automotive repair expert analyzing job similarity.

Search Query:
- Repair Type: ${searchContext.repairType}
${searchContext.vehicleMake ? `- Make: ${searchContext.vehicleMake}` : ""}
${searchContext.vehicleModel ? `- Model: ${searchContext.vehicleModel}` : ""}
${searchContext.vehicleYear ? `- Year: ${searchContext.vehicleYear}` : ""}
${searchContext.vehicleEngine ? `- Engine: ${searchContext.vehicleEngine}` : ""}

Job Candidates:
${candidates.map((c, i) => `
${i + 1}. Job ID ${c.id}:
   - Name: ${c.name}
   - Vehicle: ${c.vehicleYear || "N/A"} ${c.vehicleMake || "N/A"} ${c.vehicleModel || "N/A"}
   - Engine: ${c.vehicleEngine || "N/A"}
   - Category: ${c.jobCategory || "N/A"}
   - Labor: ${c.laborHours || "0"} hours
   - Parts: ${c.partsCount}
   - Cost: $${(c.totalCost / 100).toFixed(2)}
`).join("\n")}

For each job, provide:
1. Match score (0-100): How similar is this job to the search query?
   - 90-100: Near-perfect match (same repair + same/very similar vehicle)
   - 70-89: Strong match (same repair type, compatible vehicle)
   - 50-69: Good match (similar repair or same vehicle type)
   - 30-49: Moderate match (related repair or vehicle family)
   - 0-29: Weak match (loosely related)

2. Brief reason (1-2 sentences): Why this score? Focus on repair type similarity and vehicle compatibility.

Consider:
- Repair type terminology (e.g., "struts" = "shocks" = "suspension")
- Vehicle generations and platform sharing (e.g., F-150 2012 similar to F-150 2010-2014)
- Engine compatibility (similar displacement/cylinder count)
- Component interchangeability

Return ONLY valid JSON array format:
[
  {
    "jobId": 123,
    "matchScore": 85,
    "matchReason": "Front struts job on similar Ford truck platform with compatible suspension components"
  }
]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert automotive repair analyst. Analyze job similarity and provide accurate match scores. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    // Parse the response - it might be wrapped in an object or be a direct array
    let parsed = JSON.parse(content);
    
    // Handle different response formats
    let matches: JobMatch[];
    if (Array.isArray(parsed)) {
      matches = parsed;
    } else if (parsed.matches && Array.isArray(parsed.matches)) {
      matches = parsed.matches;
    } else if (parsed.results && Array.isArray(parsed.results)) {
      matches = parsed.results;
    } else {
      // If it's an object with job IDs as keys, convert to array
      matches = Object.values(parsed).filter((item: any) => 
        item && typeof item === 'object' && 'jobId' in item
      ) as JobMatch[];
    }

    // Validate and sanitize the matches
    return matches
      .filter((m: any) => 
        m && 
        typeof m.jobId === 'number' && 
        typeof m.matchScore === 'number' && 
        typeof m.matchReason === 'string'
      )
      .map((m: any) => ({
        jobId: m.jobId,
        matchScore: Math.min(100, Math.max(0, m.matchScore)), // Clamp between 0-100
        matchReason: m.matchReason.substring(0, 200) // Limit reason length
      }))
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by score descending

  } catch (error) {
    console.error("AI scoring error:", error);
    // Fallback: return basic text-based scoring
    return candidates.map(c => {
      const repairTypeMatch = c.name.toLowerCase().includes(searchContext.repairType.toLowerCase());
      const vehicleMatch = searchContext.vehicleMake ? 
        c.vehicleMake?.toLowerCase() === searchContext.vehicleMake.toLowerCase() : false;
      
      let score = 0;
      if (repairTypeMatch && vehicleMatch) score = 85;
      else if (repairTypeMatch) score = 70;
      else if (vehicleMatch) score = 50;
      else score = 30;

      return {
        jobId: c.id,
        matchScore: score,
        matchReason: "Match based on text similarity"
      };
    }).sort((a, b) => b.matchScore - a.matchScore);
  }
}
