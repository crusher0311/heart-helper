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
      model: "gpt-4o-mini", // Fast model for year compatibility analysis
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
      max_completion_tokens: 1000,
    });

    console.log("AI year compatibility response:", JSON.stringify(response, null, 2));
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("AI returned empty content. Full response:", response);
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
 * Uses AI to find similar vehicle models that share platforms, powertrains, or components
 * Example: Honda Accord → Acura TLX, Toyota Camry, Nissan Altima
 */
export async function getSimilarModels(
  vehicleMake: string,
  vehicleModel: string,
  vehicleYear?: number
): Promise<Array<{ make: string; model: string }>> {
  const prompt = `You are an automotive expert. Find similar vehicle models that share platforms, components, or would have similar repair procedures.

Vehicle:
- Make: ${vehicleMake}
- Model: ${vehicleModel}
${vehicleYear ? `- Year: ${vehicleYear}` : ""}

Find 5-8 similar models considering:
1. Same manufacturer (e.g., Honda Accord → Honda Civic, Honda CR-V)
2. Sister brands/badge engineering (e.g., Honda Accord → Acura TLX, Acura TSX)
3. Same platform competitors (e.g., Honda Accord → Toyota Camry, Nissan Altima)
4. Similar size/class vehicles that would use similar parts/procedures

Return ONLY valid JSON:
{
  "similarModels": [
    { "make": "Acura", "model": "TLX" },
    { "make": "Honda", "model": "Civic" },
    { "make": "Toyota", "model": "Camry" }
  ],
  "reasoning": "Brief explanation of why these models are similar"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an automotive expert. Analyze vehicle similarities and platform sharing. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    
    if (parsed.similarModels && Array.isArray(parsed.similarModels)) {
      console.log(`AI similar models: ${parsed.similarModels.length} models - ${parsed.reasoning}`);
      
      // Validate structure
      const validModels = parsed.similarModels.filter((m: any) => 
        m && typeof m.make === 'string' && typeof m.model === 'string'
      );
      
      return validModels;
    }
    
    throw new Error("Invalid response format");
  } catch (error) {
    console.error("AI similar models error:", error);
    // Return empty array on failure
    return [];
  }
}

/**
 * Uses AI to extract core repair terms from verbose customer language
 * Example: "Rear Suspension/Shocks leaking will affect tire wear" → ["rear shocks", "shock absorber", "suspension"]
 */
export async function extractRepairTerms(repairDescription: string): Promise<string[]> {
  const prompt = `You are an automotive repair expert. Extract the core repair terms from this customer description to help search historical job data.

Customer Description: "${repairDescription}"

Your task:
1. Identify the PRIMARY repair component/system mentioned
2. List common terminology variations technicians would use
3. Include both specific (e.g., "rear shocks") and general (e.g., "suspension") terms
4. Limit to 3-5 most relevant search terms

Examples:
- "Rear Suspension/Shocks leaking" → ["rear shocks", "shock absorber", "rear suspension", "shocks"]
- "Front brake pads worn out" → ["front brake pads", "brake pads", "front brakes", "brake service"]
- "Oil change needed" → ["oil change", "lube service", "engine oil"]
- "Check engine light, rough idle" → ["check engine", "rough idle", "diagnostic", "engine misfire"]

Return ONLY valid JSON:
{
  "searchTerms": ["term1", "term2", "term3"],
  "primaryComponent": "Brief description of main repair"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an automotive repair terminology expert. Extract searchable repair terms from customer descriptions. Always respond with valid JSON only."
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
    
    if (parsed.searchTerms && Array.isArray(parsed.searchTerms)) {
      console.log(`AI extracted repair terms from "${repairDescription}": ${parsed.searchTerms.join(', ')} (Primary: ${parsed.primaryComponent})`);
      return parsed.searchTerms.filter((term: any) => typeof term === 'string' && term.length > 0);
    }
    
    throw new Error("Invalid response format");
  } catch (error) {
    console.error("AI repair term extraction error:", error);
    // Fallback: return original description as single term
    return [repairDescription];
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
      model: "gpt-4o-mini", // Fast and cost-effective model for scoring repair job matches
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
      max_completion_tokens: 2000, // Reduced from 4096 for faster responses
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.error("AI returned empty content for job scoring");
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
    } else if (parsed.jobs && Array.isArray(parsed.jobs)) {
      matches = parsed.jobs; // Handle "jobs" key from AI response
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

// ==========================================
// Concern Intake AI Functions
// ==========================================

import type {
  GenerateConcernQuestionsRequest,
  GenerateConcernQuestionsResponse,
  ReviewConcernConversationRequest,
  ReviewConcernConversationResponse,
  CleanConversationRequest,
  CleanConversationResponse,
} from "@shared/schema";

/**
 * Generates diagnostic follow-up questions based on customer's initial concern
 * Helps service advisors gather complete information during the call
 */
export async function generateConcernFollowUpQuestions(
  request: GenerateConcernQuestionsRequest
): Promise<GenerateConcernQuestionsResponse> {
  const { customerConcern, vehicleInfo } = request;

  const vehicleContext = vehicleInfo
    ? `Vehicle: ${vehicleInfo.year || ''} ${vehicleInfo.make || ''} ${vehicleInfo.model || ''}`.trim()
    : '';

  const prompt = `You are an experienced automotive service advisor at HEART Certified Auto Care. A customer has called with a concern and you need to ask follow-up questions to gather complete diagnostic information.

Customer's Initial Concern: "${customerConcern}"
${vehicleContext ? `\n${vehicleContext}` : ''}

Generate 5 diagnostic follow-up questions that will help:
1. Pinpoint the exact symptom (when, where, how often)
2. Understand the conditions when it occurs (hot/cold, speed, weather)
3. Check for related symptoms the customer might not have mentioned
4. Gather safety-relevant information
5. Determine urgency/severity

GUIDELINES:
- Keep questions conversational and friendly
- Ask one thing at a time (not compound questions)
- Start with the most important diagnostic info
- Include at least one question about safety concerns
- Avoid technical jargon - use everyday language

Return ONLY valid JSON:
{
  "questions": [
    "When did you first notice this?",
    "Does it happen all the time or only in certain conditions?",
    "Have you noticed any other changes with the vehicle?",
    "Does the problem get worse when the engine is cold or hot?",
    "Is it affecting your ability to drive safely?"
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a friendly, experienced automotive service advisor. Generate helpful diagnostic questions in everyday language. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    
    if (parsed.questions && Array.isArray(parsed.questions)) {
      return {
        questions: parsed.questions.filter((q: any) => typeof q === 'string' && q.length > 0)
      };
    }
    
    throw new Error("Invalid response format");
  } catch (error) {
    console.error("AI concern questions error:", error);
    // Fallback questions
    return {
      questions: [
        "When did you first notice this issue?",
        "Does it happen all the time or only sometimes?",
        "Have you noticed any other changes with your vehicle?",
        "Is this affecting your ability to drive safely?",
        "Have you had any recent work done on the vehicle?"
      ]
    };
  }
}

/**
 * Reviews the conversation so far and suggests additional questions if needed
 * Helps ensure complete information is gathered
 */
export async function reviewConcernConversation(
  request: ReviewConcernConversationRequest
): Promise<ReviewConcernConversationResponse> {
  const { customerConcern, answeredQuestions, vehicleInfo } = request;

  const vehicleContext = vehicleInfo
    ? `Vehicle: ${vehicleInfo.year || ''} ${vehicleInfo.make || ''} ${vehicleInfo.model || ''}`.trim()
    : '';

  const qaHistory = answeredQuestions
    .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join('\n\n');

  const prompt = `You are an automotive service advisor reviewing a concern intake conversation. Determine if we have enough information or need to ask more questions.

Customer's Initial Concern: "${customerConcern}"
${vehicleContext ? `\n${vehicleContext}` : ''}

Conversation So Far:
${qaHistory}

EVALUATE:
1. Do we have enough information to diagnose the problem?
2. Are there any important gaps in the diagnostic information?
3. Did any answers raise new questions that should be explored?
4. Is there safety information we should confirm?

IF more questions are needed (max 3), ask ONLY for missing critical information.
IF we have enough info, return empty array.

Return ONLY valid JSON:
{
  "additionalQuestions": ["question1", "question2"],
  "isComplete": false,
  "reasoning": "Brief explanation of what's missing or why it's complete"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an automotive service advisor evaluating conversation completeness. Be concise - only ask for truly missing critical information. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);
    
    return {
      additionalQuestions: Array.isArray(parsed.additionalQuestions) 
        ? parsed.additionalQuestions.filter((q: any) => typeof q === 'string' && q.length > 0)
        : [],
      isComplete: parsed.isComplete === true || (parsed.additionalQuestions?.length === 0)
    };
  } catch (error) {
    console.error("AI conversation review error:", error);
    return {
      additionalQuestions: [],
      isComplete: true
    };
  }
}

/**
 * Cleans and formats the conversation into a professional paragraph
 * suitable for adding to Tekmetric as a concern note
 */
export async function cleanConcernConversation(
  request: CleanConversationRequest
): Promise<CleanConversationResponse> {
  const { customerConcern, answeredQuestions, conversationNotes } = request;

  const qaHistory = answeredQuestions
    .map((qa, i) => `Q: ${qa.question}\nA: ${qa.answer}`)
    .join('\n\n');

  const prompt = `You are an automotive service advisor. Convert this concern intake conversation into a clear, professional paragraph that can be added to a repair order.

Customer's Initial Concern: "${customerConcern}"

Conversation:
${qaHistory}

${conversationNotes ? `Additional Notes: ${conversationNotes}` : ''}

GUIDELINES:
1. Write in third person ("Customer reports..." not "I noticed...")
2. Include all relevant diagnostic details from the conversation
3. Organize logically: main concern → symptoms → conditions → duration → other details
4. Be concise but complete (aim for 2-4 sentences)
5. Use professional automotive terminology where appropriate
6. Highlight any safety concerns if mentioned

Return ONLY valid JSON:
{
  "cleanedText": "Customer reports [main concern]. [Symptoms and conditions]. [Additional relevant details]."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an automotive service advisor writing professional concern notes for repair orders. Always respond with valid JSON only."
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
    
    if (parsed.cleanedText && typeof parsed.cleanedText === 'string') {
      return { cleanedText: parsed.cleanedText };
    }
    
    throw new Error("Invalid response format");
  } catch (error) {
    console.error("AI conversation cleaning error:", error);
    // Fallback: simple concatenation
    const parts = [
      `Customer reports: ${customerConcern}`,
      ...answeredQuestions.map(qa => `${qa.answer}`),
      conversationNotes
    ].filter(Boolean);
    
    return { cleanedText: parts.join('. ') };
  }
}

// ==========================================
// Sales Script Generation
// ==========================================

export interface SalesScriptRequest {
  vehicle?: {
    year?: string;
    make?: string;
    model?: string;
  };
  jobs: Array<{
    name?: string;
    description?: string;
    laborTotal?: number;
    partsTotal?: number;
  }>;
  customer?: {
    name?: string;
  };
  totalAmount?: number; // Extracted from Tekmetric page
  isInShop?: boolean;   // Whether vehicle is currently in shop vs follow-up call
  trainingGuidelines?: string; // User-provided example scripts and guidelines
}

export interface SalesScriptResponse {
  script: string;
}

/**
 * Generates a customized sales script based on the repair order
 * Helps service advisors communicate value and build trust with customers
 */
export async function generateSalesScript(
  request: SalesScriptRequest
): Promise<SalesScriptResponse> {
  const { vehicle, jobs, customer, totalAmount: providedTotal, isInShop, trainingGuidelines } = request;

  const vehicleDesc = vehicle 
    ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || 'their vehicle'
    : 'their vehicle';

  // Clean up job names - remove duplicates and noise
  const cleanedJobs = jobs
    .map(job => {
      let name = job.name || job.description || '';
      // Remove technician names and embedded prices
      name = name.replace(/\s+[A-Z]+\s+M\.\d+\.\d+\$[\d.]+\$[\d.]+/g, '');
      name = name.replace(/\$[\d,.]+/g, '');
      name = name.replace(/\s{2,}/g, ' ').trim();
      return { ...job, name };
    })
    .filter(job => job.name && job.name.length > 3);

  // Get unique job names (deduplicate)
  const seenNames: string[] = [];
  const uniqueJobs = cleanedJobs.filter(job => {
    const normalized = job.name.toLowerCase();
    if (seenNames.includes(normalized)) return false;
    // Also skip if one job name contains another
    for (const seen of seenNames) {
      if (normalized.includes(seen) || seen.includes(normalized)) return false;
    }
    seenNames.push(normalized);
    return true;
  });

  const jobsList = uniqueJobs.map(job => job.name).join(', ');
  
  // Use provided total from page, or calculate from jobs if not available
  const calculatedTotal = jobs.reduce((sum, job) => sum + (job.laborTotal || 0) + (job.partsTotal || 0), 0);
  const totalAmount = providedTotal || calculatedTotal;

  const customerName = customer?.name?.split(' ')[0] || ''; // First name only

  // Determine context and adjust script accordingly
  const context = isInShop 
    ? 'The customer is currently AT THE SHOP with their vehicle. This is an in-person conversation, not a phone call.'
    : 'This is a PHONE CALL to follow up with the customer about the digital inspection.';

  // Determine which services might have warranty (brake work, engine, transmission, etc. - but NOT tires, basic maintenance)
  const hasWarrantyServices = /brake|engine|transmission|suspension|steering|cooling|electrical|fuel|exhaust|timing/i.test(jobsList);
  const warrantyNote = hasWarrantyServices 
    ? "Mention HEART's 3-year/36,000 mile nationwide warranty if applicable to the recommended services."
    : "Do NOT mention warranty for basic services like tire swaps, oil changes, or seasonal maintenance - they typically don't have the 3-year warranty.";

  // Build training context if provided
  const trainingContext = trainingGuidelines 
    ? `\n\nIMPORTANT - Follow these example scripts and guidelines from the shop:\n${trainingGuidelines}\n\nUse the style and tone from these examples while adapting to the current situation.`
    : '';

  const prompt = `You are a friendly service advisor at HEART Certified Auto Care. Write a SHORT, conversational script.

CONTEXT: ${context}

Customer: ${customerName || 'the customer'}
Vehicle: ${vehicleDesc}
Services: ${jobsList}
${totalAmount > 0 ? `Total: $${totalAmount.toFixed(2)}` : 'Total: Check the repair order for final amount'}
${trainingContext}

Write a SINGLE PARAGRAPH (3-5 sentences max) that:
1. Greets the customer by first name if available
${isInShop 
  ? '2. Thanks them for bringing in their vehicle and mentions the inspection'
  : '2. References the digital inspection you sent over'}
3. Briefly mentions what service is recommended and why it matters
4. ${totalAmount > 0 ? `States the total investment of $${totalAmount.toFixed(2)}` : 'Asks if they have any questions about pricing'}
5. ${warrantyNote}
6. ${isInShop ? 'Asks if they want to proceed' : 'Asks if they are ready to schedule'}

CRITICAL RULES:
- Write as a natural ${isInShop ? 'in-person conversation' : 'phone conversation'}, not bullet points
- Keep it SHORT and friendly - like you're actually talking
- Don't list every service separately, summarize the main work
- ${totalAmount > 0 ? `Use the EXACT total of $${totalAmount.toFixed(2)} - do not say "$XX" or make up a number` : 'Do not make up pricing - ask them to check the estimate'}
- End with a simple question to get their response

Return ONLY the script paragraph, no headers or formatting.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a friendly automotive service advisor at HEART Certified Auto Care. Write natural, conversational sales scripts. Keep responses short and focused - no bullet points or headers, just a friendly paragraph. Always use the EXACT pricing provided - never placeholder amounts."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_completion_tokens: 300,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    // Clean up any markdown or HTML that slipped through
    const cleanScript = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,4}\s*/g, '')
      .trim();

    return { script: cleanScript };
  } catch (error) {
    console.error("AI sales script generation error:", error);
    
    // Fallback: simple conversational script
    const greeting = customerName ? `Hi ${customerName}!` : 'Hi there!';
    const action = isInShop ? 'for bringing in' : 'for choosing';
    const priceStr = totalAmount > 0 ? `$${totalAmount.toFixed(2)}` : 'the amount on your estimate';
    const fallbackScript = `${greeting} Thanks ${action} your ${vehicleDesc}. I sent over a copy of your digital inspection, did you get it? Great! Would you mind opening it up and we can go over it together? We're recommending ${jobsList || 'some maintenance services'} to keep you safe and prepared. Your total investment is ${priceStr}. Once you're ready, we can get you all set up. How does that sound?`;
    
    return { script: fallbackScript };
  }
}
