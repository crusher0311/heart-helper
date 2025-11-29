/**
 * Symptom-Based Questions Reference
 * 
 * This guide provides structured questions to gather detailed information from customers 
 * about vehicle issues. Use these questions to understand symptoms and guide diagnostics.
 * 
 * IMPORTANT GUIDELINES:
 * - Avoid: "What makes you think you need a...?"
 * - Use: "Tell me about the [issue/component]. What symptoms are you experiencing?"
 * - Avoid: "Have you had it inspected?"
 * - Use: "Have you had a trusted shop perform the necessary testing?"
 */

export interface SymptomCategory {
  category: string;
  keywords: string[];
  questions: string[];
}

export const GENERAL_QUESTIONS = [
  "What is the make and model of your vehicle?",
  "How many miles are on your vehicle?",
  "What symptoms are you experiencing?",
  "How long have you been experiencing these symptoms?",
  "Do these symptoms occur at a specific time or under specific conditions?",
  "Are any warning lights on? If yes, describe which ones.",
  "Tell me the story about your issue. What happened?"
];

export const SYMPTOM_CATEGORIES: SymptomCategory[] = [
  {
    category: "Check Engine Light",
    keywords: ["check engine", "engine light", "warning light", "CEL", "MIL", "service engine soon"],
    questions: [
      "Tell me the story about your check engine light. What happened?",
      "How long has the warning light been on?",
      "Is the light flashing or steady?",
      "Are there additional warning lights on?",
      "Have you noticed any changes in how the vehicle runs?"
    ]
  },
  {
    category: "Battery/Alternator/Starting",
    keywords: ["battery", "alternator", "won't start", "no start", "dead battery", "jump start", "cranking", "clicking"],
    questions: [
      "Tell me the story about your battery or alternator issue. What happened?",
      "Have you had to jump-start the vehicle?",
      "Is the vehicle starting at all?",
      "Does it make any noise when you try to start it?",
      "Are the dashboard lights on when the key is turned to the 'on' position?"
    ]
  },
  {
    category: "Brakes",
    keywords: ["brake", "brakes", "stopping", "squeaking", "grinding", "pulsating", "soft pedal", "brake pedal", "ABS"],
    questions: [
      "Tell me the story about your brakes, what is happening?",
      "Are any warning lights on?",
      "Are you hearing any noises? When does the noise occur?",
      "Where does the noise seem to come from?",
      "How long have you been hearing the noise?",
      "Has the noise changed over time?",
      "Is the steering wheel shaking? Does it happen while braking or all the time?",
      "Does the brake pedal feel different (e.g., soft, hard, or pulsating)?",
      "When was your last brake inspection?",
      "When were your brakes last replaced?"
    ]
  },
  {
    category: "Cooling System",
    keywords: ["overheating", "coolant", "radiator", "thermostat", "water pump", "temperature", "steam", "leak", "antifreeze"],
    questions: [
      "Tell me the story about your cooling issue. What happened?",
      "Are any warning lights on?",
      "What is the temperature gauge on the dashboard reading?",
      "Are you seeing fluid on the ground under the engine?",
      "Do you see steam coming from the engine?",
      "Have you had to add coolant recently?"
    ]
  },
  {
    category: "Transmission",
    keywords: ["transmission", "shifting", "slipping", "won't go in gear", "reverse", "neutral", "gear", "clutch"],
    questions: [
      "Tell me the story about your transmission. What happened?",
      "Are any warning lights on?",
      "Is it automatic or manual transmission?",
      "Can the vehicle be driven to our shop, or will you need a tow service?",
      "Does the vehicle work in reverse?",
      "Are you noticing any delays when shifting?"
    ]
  },
  {
    category: "Steering and Suspension",
    keywords: ["steering", "suspension", "clunk", "noise", "struts", "shocks", "tie rod", "ball joint", "pulling", "wandering", "alignment"],
    questions: [
      "Tell me the story about your steering or suspension issue. What happened?",
      "Are any warning lights on?",
      "What symptoms are you experiencing?",
      "Under what conditions do these symptoms occur (e.g., when moving, turning, over bumps)?",
      "Is the vehicle pulling to one side?",
      "Are you hearing any noises?",
      "When was your last alignment?"
    ]
  },
  {
    category: "Tires",
    keywords: ["tire", "tires", "flat", "worn", "bald", "puncture", "pressure", "TPMS"],
    questions: [
      "Tell me the story about your tires. Why do they need to be replaced?",
      "What is the condition of your tires? Are they worn out, too old, or damaged?",
      "What are you looking for in a tire (e.g., performance, longevity)?",
      "Do you have a preferred tire brand?",
      "What is the size and brand of the tires currently on your vehicle?"
    ]
  },
  {
    category: "Alignment",
    keywords: ["alignment", "pulling", "vibration", "uneven wear", "pothole", "curb"],
    questions: [
      "Tell me the story about your vehicle's alignment. What is happening?",
      "Have you recently had suspension, steering, or tire work done?",
      "Have you noticed vibrations, pulling, or anything unusual while driving?",
      "Have you hit a pothole or curb recently?",
      "When was your last alignment?"
    ]
  },
  {
    category: "Air Conditioning",
    keywords: ["AC", "A/C", "air conditioning", "cold air", "warm air", "heat", "heater", "blower", "climate"],
    questions: [
      "Tell me the story about your air conditioning. What is happening?",
      "How long has the air conditioning not been working?",
      "Is the air conditioning blowing warm air?",
      "Does the air blow at all? Does it work at high or low speeds?",
      "When was the last time your air conditioning was charged or repaired?"
    ]
  },
  {
    category: "Timing Belt",
    keywords: ["timing belt", "timing chain", "cam belt", "timing"],
    questions: [
      "Tell me the story about your timing belt. What happened?",
      "Is the vehicle running normally?",
      "Are you replacing the timing belt due to its age or mileage?",
      "Do you have service records for the vehicle?",
      "How many miles are on your vehicle?"
    ]
  },
  {
    category: "Emissions",
    keywords: ["emissions", "smog", "inspection", "registration", "catalytic", "exhaust"],
    questions: [
      "Tell me the story about your emissions issue. What is happening?",
      "Are any warning lights on?",
      "Are you noticing any symptoms?",
      "How long have you owned the vehicle?",
      "When is your vehicle registration due?",
      "Have you had a trusted shop perform emissions testing?"
    ]
  },
  {
    category: "Tune-Up",
    keywords: ["tune-up", "tune up", "spark plug", "maintenance", "service", "running rough", "misfire"],
    questions: [
      "Tell me the story about your vehicle's tune-up needs. What symptoms are you experiencing?",
      "Are you seeking a tune-up to fix a specific problem or as routine maintenance?",
      "Is there anything specific you want to replace (e.g., spark plugs, filters)?",
      "How many miles are on your vehicle?",
      "Have you ever had a tune-up before?",
      "Are any warning lights on?",
      "When was the last time your vehicle was serviced?"
    ]
  },
  {
    category: "Smell",
    keywords: ["smell", "odor", "burning", "sweet", "musty", "gas", "fuel", "exhaust smell"],
    questions: [
      "How long have you been experiencing the smell?",
      "Can you describe the smell? Is it sweet, burning, musty, or plastic-like?",
      "Where does the smell seem to be coming from?",
      "What steps can you take to replicate the smell?",
      "Does it happen when the engine is cold or hot?"
    ]
  },
  {
    category: "Engine/Transmission Replacement",
    keywords: ["engine replacement", "transmission replacement", "new engine", "new transmission", "blown engine", "rebuild"],
    questions: [
      "Tell me more, what is going on with your engine or transmission?",
      "Is the vehicle drivable or would it have to be towed in?",
      "Tell me the story about what happened with your engine or transmission.",
      "What sort of symptoms are you or were you having?",
      "How many miles do you have on your vehicle?",
      "Do you have a budget you are aiming for?",
      "Is this your everyday driver?",
      "Are you looking for a cheaper price or a second opinion?",
      "What are your long-term plans with the vehicle?",
      "Do you have a preference between used, new, or rebuilt?"
    ]
  },
  {
    category: "Noise",
    keywords: ["noise", "sound", "clunk", "squeak", "rattle", "grinding", "whine", "hum", "knock", "bang"],
    questions: [
      "Tell me about the noise you're hearing. What does it sound like?",
      "When do you hear the noise? All the time, or only under certain conditions?",
      "Where does the noise seem to be coming from?",
      "Does the noise change with speed, braking, turning, or going over bumps?",
      "How long have you been hearing this noise?",
      "Has the noise gotten worse over time?"
    ]
  },
  {
    category: "Oil/Fluid Leak",
    keywords: ["oil leak", "fluid leak", "dripping", "puddle", "stain", "oil spot", "leak"],
    questions: [
      "Tell me about the leak. What color is the fluid?",
      "Where does the leak appear to be coming from?",
      "How long have you noticed the leak?",
      "How much fluid are you seeing? A few drops or a puddle?",
      "Have you had to add fluid recently?",
      "Are any warning lights on?"
    ]
  }
];

/**
 * Checks if a keyword matches in the concern using word boundaries
 * Prevents "AC" from matching within "replace" or "vacuum"
 */
function keywordMatches(concern: string, keyword: string): boolean {
  const lowerKeyword = keyword.toLowerCase();
  const lowerConcern = concern.toLowerCase();
  
  // For very short keywords (2-3 chars like "AC"), require exact word boundary
  if (lowerKeyword.length <= 3) {
    // Use word boundary regex for short keywords
    const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, 'i');
    return wordBoundaryRegex.test(lowerConcern);
  }
  
  // For longer keywords, use word boundary matching as well
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(lowerKeyword)}\\b`, 'i');
  if (wordBoundaryRegex.test(lowerConcern)) {
    return true;
  }
  
  // Also allow partial matches for multi-word phrases like "check engine light"
  // if the keyword is longer than 5 characters
  if (lowerKeyword.length > 5 && lowerConcern.includes(lowerKeyword)) {
    return true;
  }
  
  return false;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the most relevant symptom category based on customer concern keywords
 * Uses word boundary matching to prevent false positives
 */
export function matchSymptomCategory(customerConcern: string): SymptomCategory | null {
  // Score each category by keyword matches
  let bestMatch: SymptomCategory | null = null;
  let bestScore = 0;
  
  for (const category of SYMPTOM_CATEGORIES) {
    let score = 0;
    for (const keyword of category.keywords) {
      if (keywordMatches(customerConcern, keyword)) {
        // Score based on keyword length - longer/more specific matches score higher
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category;
    }
  }
  
  // Require a minimum score to return a match
  // Score of 4 allows single keywords like "heat", "odor", "leak", "tire" to match
  // while still filtering out 2-3 character noise
  if (bestScore < 4) {
    return null;
  }
  
  return bestMatch;
}

/**
 * Gets formatted prompt context for the AI based on customer concern
 */
export function getSymptomQuestionsContext(customerConcern: string): string {
  const matchedCategory = matchSymptomCategory(customerConcern);
  
  if (!matchedCategory) {
    return `
Use these general diagnostic questions as a guide:
${GENERAL_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n')}
`;
  }
  
  return `
The customer's concern appears to be related to: ${matchedCategory.category}

Use these expert diagnostic questions as a guide for this type of issue:
${matchedCategory.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Additional general questions if needed:
- How long have you been experiencing these symptoms?
- Do these symptoms occur at a specific time or under specific conditions?
- Are any warning lights on?
`;
}

/**
 * Gets all available symptom categories for reference
 */
export function getAllSymptomCategories(): string[] {
  return SYMPTOM_CATEGORIES.map(c => c.category);
}
