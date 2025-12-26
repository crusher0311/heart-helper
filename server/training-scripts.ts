/**
 * HEART Helper Training Playbook
 * Reference scripts for AI-generated responses
 * 
 * Voice: Calm, senior advisor
 * Philosophy: Facts create confidence. Confidence drives decisions.
 * Heart Rule: We guide decisions — we do not pressure them.
 */

export const HEART_TRAINING_PLAYBOOK = {
  // Core principles
  corePrinciples: {
    priceShopperHandling: "Price is what people ask for when they lack confidence. Facts remove uncertainty. Confidence replaces price focus.",
    appointmentSetting: "Appointments are not sold. They are the natural next step when clarity replaces uncertainty.",
    pricePresentationSelling: "Price is presented after facts. Investment is explained, not justified.",
    objectionClarification: "Objections are information gaps — not resistance.",
  },

  // ==========================================
  // SECTION 1: PRICE SHOPPER HANDLING
  // ==========================================
  priceShopperScripts: {
    howMuchIsIt: {
      name: "How Much Is It? (Primary Intake)",
      trigger: "Customer asks for price on a service",
      script: `Customer: "How much do you charge for brakes?"

Advisor: "That's a very common question, and I can help with that. Before I give you a number that may or may not apply, do you mind if I ask a couple quick questions about the vehicle?"

(Wait for permission)

Advisor: "Thank you. What year, make, and model is the vehicle, and what symptoms are you experiencing?"

(Listen fully — do not interpret yet)

Advisor (Reframe): "The reason I ask is because brake pricing depends on what's actually happening — pads, rotors, calipers, or sometimes something else entirely."

Advisor (Confidence Shift): "Most people calling for price aren't shopping for the cheapest option — they're trying to make sure they don't make the wrong decision."

Advisor (Next Step): "What we recommend is starting with an inspection so we can give you accurate information and clear options before any decisions are made."`,
    },

    justPriceShopping: {
      name: "I'm Just Price Shopping",
      trigger: "Customer explicitly says they're comparing prices",
      script: `Customer: "I'm just calling around getting prices."

Advisor: "I understand — and that makes sense. When you don't have clear information, price is usually the only thing you can compare."

Advisor: "Has the vehicle already been inspected somewhere, or are you still trying to identify what symptoms it's showing?"

Advisor (Reframe): "Our process focuses on identifying what's actually happening first, so you're deciding based on facts — not assumptions."

Advisor (Close): "The next step would just be an inspection. From there, you decide how you want to move forward."`,
    },

    onlineTextPriceInquiry: {
      name: "Online / Text Price Inquiry",
      trigger: "Simple maintenance price question",
      script: `Customer: "How much is an oil change?"

Advisor: "I'm happy to help. Oil change pricing depends on the vehicle and the service it requires."

Advisor: "What year, make, and model is the vehicle, and are you experiencing any warning lights or maintenance messages?"

Advisor (Reframe): "We ask because using the correct oil and service interval protects the engine long-term — not just today."

Advisor (Confidence): "Our goal is to help you feel confident the vehicle is being serviced correctly."`,
    },

    anotherShopCheaper: {
      name: "Another Shop Gave Me a Cheaper Price",
      trigger: "Customer mentions competitor pricing",
      script: `Customer: "Another shop was cheaper."

Advisor: "That's fairly common — prices can vary quite a bit."

Advisor: "Did they explain what they found on the vehicle, or just provide a number?"

Advisor: "What symptoms were you experiencing that led you to call them?"

Advisor (Reframe): "Two prices can sound very different, but what matters is whether the same issue is actually being solved."

Advisor (Bridge): "Our recommendation is to inspect the vehicle so you can compare based on facts, not guesses."`,
    },

    justGiveMeBallpark: {
      name: "Just Give Me a Ballpark",
      trigger: "Customer insists on approximate pricing",
      script: `Customer: "I just need a ballpark number."

Advisor: "I understand — and I don't want to give you misleading information."

Advisor: "Without knowing the symptoms or inspecting the vehicle, ballpark numbers are often wrong — and wrong numbers tend to cause frustration later."

Advisor (Reframe): "Our process is designed to give you accurate information first, so there are no surprises."

Advisor (Close): "Let's start by identifying what's actually happening. Then you're in control of the decision."`,
    },
  },

  // ==========================================
  // SECTION 2: APPOINTMENT SETTING
  // ==========================================
  appointmentSettingScripts: {
    firstTimeCallerInspection: {
      name: "First-Time Caller → Inspection Appointment",
      script: `Advisor: "Based on what you've described, the best next step is to inspect the vehicle so we can give you accurate information."

Advisor (Reframe): "That inspection allows us to confirm what's causing the symptoms and show you clear options — before any decisions are made."

Advisor (Soft Close): "We have availability ___ or ___. Which works better for you?"`,
    },

    priceShopperTransition: {
      name: "Price Shopper → Appointment Transition",
      script: `Advisor: "Instead of guessing on price, the most helpful thing we can do is identify exactly what's happening."

Advisor: "That way, you're deciding based on facts — not assumptions."

Advisor (Close): "Let's get the vehicle in, gather the information, and then you can decide how you'd like to move forward."`,
    },

    hesitantCustomer: {
      name: "Hesitant Customer (I Need to Think About It)",
      script: `Customer: "I need to think about it."

Advisor: "Of course — that's completely reasonable."

Advisor (Clarify): "Is there anything you feel unsure about, or do you just want time to review what we discussed?"

Advisor (Reframe): "The inspection doesn't lock you into repairs — it just gives you clarity."`,
    },

    appointmentConfirmation: {
      name: "Appointment Confirmation Language",
      script: `Advisor: "So we're scheduled for ___ at ___. We'll inspect the vehicle, review what we find with you, and then you'll decide how you want to proceed."

Advisor (Expectation): "Our goal is to make sure you feel informed and confident — no surprises."`,
    },
  },

  // ==========================================
  // SECTION 3: PRICE PRESENTATION & SELLING
  // ==========================================
  pricePresentationScripts: {
    transitionInspectionToPrice: {
      name: "Transition From Inspection to Price",
      script: `Advisor: "Thanks for giving us the time to inspect the vehicle. I want to walk you through what we found so you have a clear picture before we talk about numbers."

Advisor (Facts First): "Based on the inspection, here's what we're seeing and the symptoms it explains."

Advisor (Reframe): "The goal here isn't just to replace a part — it's to solve the issue you're experiencing and protect the vehicle from bigger problems later."

Advisor (Permission): "When you're ready, I can walk you through the repair options and pricing."`,
    },

    singleRepairPresentation: {
      name: "Single Repair Price Presentation",
      script: `Advisor: "To address the symptoms we discussed, the recommended repair would be ___. This includes parts, labor, and warranty."

Advisor (Outcome): "This repair resolves the issue and restores the system to proper operation."

Advisor (Investment Language): "The total investment to address this properly and protect the vehicle long-term comes to $____."

(Pause)

Advisor: "What questions do you have about the repair or what it solves?"`,
    },

    goodBetterBest: {
      name: "Good / Better / Best Presentation",
      script: `Advisor: "There are a few ways we can approach this, depending on how you want to balance cost, longevity, and risk."

Advisor (Good): "This option addresses the immediate issue. The investment is $____."

Advisor (Better): "This option reduces the likelihood of repeat issues. The investment is $____."

Advisor (Best): "This option restores the system fully and provides the longest service life. The investment is $____."

Advisor (Reframe): "All three are valid — the difference is how much future risk you're comfortable with."

Advisor (Close): "Which option feels like the best fit for you and the vehicle?"`,
    },

    priceResistance: {
      name: "Handling Price Resistance",
      script: `Customer: "That's more than I expected."

Advisor: "I understand. Most people aren't expecting repair costs until they see the full picture."

Advisor (Clarify): "Is your concern more about the total investment, or about understanding what the repair includes?"`,
    },

    budgetBasedSelling: {
      name: "Budget-Based Selling (Without Discounting)",
      script: `Advisor: "If budget is a concern, we can absolutely talk through priorities."

Advisor: "Based on the inspection, these items affect safety and reliability, and these items can be deferred without immediate risk."

Advisor (Investment Reframe): "When people think about this as an investment, they're usually comparing it to breakdowns, downtime, or replacing the vehicle sooner than planned."

Advisor (Control): "You're in control of how we move forward — my role is to make sure you understand the trade-offs."`,
    },
  },

  // ==========================================
  // SECTION 4: OBJECTION CLARIFICATION
  // ==========================================
  objectionScripts: {
    tooExpensive: {
      name: "That's Too Expensive",
      script: `Advisor: "I understand."

(Pause)

Advisor: "Is your concern more about the total investment, or about understanding what's included?"`,
    },

    talkToSpouse: {
      name: "I Need to Talk to My Spouse / Partner",
      script: `Advisor: "That makes sense — it's an important decision."

Advisor: "Would it help if I summarized what we found and the options, so it's easier to explain?"`,
    },

    anotherShopDifferent: {
      name: "Another Shop Said Something Different",
      script: `Advisor: "That happens sometimes."

Advisor: "Did they explain what symptoms they were addressing, or what led them to that recommendation?"

Advisor (Reframe): "What matters most is whether the same issue is being solved."`,
    },

    notReadyToDecide: {
      name: "I'm Not Ready to Decide Yet",
      script: `Advisor: "I understand."

Advisor (Control): "My role isn't to rush you — it's to make sure you have the information you need when you are ready."`,
    },
  },

  // Core rules to remember
  coreRules: [
    "Price is not the objection. Uncertainty is. Facts remove uncertainty.",
    "Appointments are clarity tools, not commitments.",
    "We do not sell price. We present information. Confidence drives decisions.",
    "Facts first. Clarity second. Decisions last.",
  ],
};

/**
 * Gets price shopper handling guidance for AI prompts
 */
export function getPriceShopperGuidance(): string {
  const scripts = HEART_TRAINING_PLAYBOOK.priceShopperScripts;
  return `
PRICE SHOPPER HANDLING REFERENCE:
Core Principle: ${HEART_TRAINING_PLAYBOOK.corePrinciples.priceShopperHandling}

Key Techniques:
1. Ask permission before gathering information: "Do you mind if I ask a couple quick questions?"
2. Gather vehicle info first: year, make, model, symptoms
3. Reframe the conversation: Focus on solving the right problem, not just price
4. Shift to confidence: "Most people calling for price aren't shopping for cheapest — they want to make the right decision"
5. Guide to inspection: "Let's start by identifying what's happening. Then you're in control."

Example Response to "How much for brakes?":
"That's a very common question. Before I give you a number that may not apply, do you mind if I ask about the vehicle? The reason is that brake pricing depends on what's actually happening — pads, rotors, calipers, or sometimes something else entirely."

Example Response to "Just give me a ballpark":
"I understand — and I don't want to give you misleading information. Without knowing symptoms or inspecting, ballpark numbers tend to cause frustration later. Our process gives you accurate information first, so there are no surprises."`;
}

/**
 * Gets appointment setting guidance for AI prompts
 */
export function getAppointmentSettingGuidance(): string {
  return `
APPOINTMENT SETTING REFERENCE:
Core Principle: ${HEART_TRAINING_PLAYBOOK.corePrinciples.appointmentSetting}

Key Techniques:
1. Present inspection as the natural next step, not a commitment
2. Use either/or soft close: "We have availability ___ or ___. Which works better?"
3. Reassure hesitant customers: "The inspection doesn't lock you into repairs — it just gives you clarity"
4. Set expectations: "We'll inspect, review what we find, and then you decide"

Example Transition:
"Based on what you've described, the best next step is to inspect the vehicle so we can give you accurate information and clear options — before any decisions are made."`;
}

/**
 * Gets price presentation guidance for AI prompts
 */
export function getPricePresentationGuidance(): string {
  return `
PRICE PRESENTATION REFERENCE:
Core Principle: ${HEART_TRAINING_PLAYBOOK.corePrinciples.pricePresentationSelling}

Key Techniques:
1. Start with facts from inspection, then transition to price
2. Use "investment" language instead of "cost"
3. Explain what the repair SOLVES, not just what it replaces
4. For multiple options, use Good/Better/Best format
5. Let them choose: "Which option feels like the best fit for you and the vehicle?"

Investment Language Example:
"The total investment to address this properly and protect the vehicle long-term comes to $___. What questions do you have about the repair or what it solves?"

Good/Better/Best Example:
"Good: Addresses the immediate issue for $___"
"Better: Reduces likelihood of repeat issues for $___"
"Best: Restores the system fully for the longest service life at $___"
"All three are valid — the difference is how much future risk you're comfortable with."`;
}

/**
 * Gets objection handling guidance for AI prompts  
 */
export function getObjectionHandlingGuidance(): string {
  return `
OBJECTION CLARIFICATION REFERENCE:
Core Principle: ${HEART_TRAINING_PLAYBOOK.corePrinciples.objectionClarification}

Key Objections and Responses:

"That's too expensive":
→ Pause, then: "Is your concern more about the total investment, or about understanding what's included?"

"I need to talk to my spouse":
→ "That makes sense — it's an important decision. Would it help if I summarized what we found and the options, so it's easier to explain?"

"Another shop said something different":
→ "That happens sometimes. Did they explain what symptoms they were addressing? What matters most is whether the same issue is being solved."

"I'm not ready to decide":
→ "I understand. My role isn't to rush you — it's to make sure you have the information you need when you are ready."

"I need to think about it":
→ "Of course — that's completely reasonable. Is there anything you feel unsure about, or do you just want time to review what we discussed?"`;
}

/**
 * Gets the full training context for AI prompts
 */
export function getFullTrainingContext(): string {
  return `
HEART HELPER TRAINING PLAYBOOK

Voice: Calm, senior advisor
Philosophy: Facts create confidence. Confidence drives decisions.
Heart Rule: We guide decisions — we do not pressure them.

${getPriceShopperGuidance()}

${getAppointmentSettingGuidance()}

${getPricePresentationGuidance()}

${getObjectionHandlingGuidance()}

CORE RULES TO REMEMBER:
${HEART_TRAINING_PLAYBOOK.coreRules.map(r => `• ${r}`).join('\n')}`;
}
