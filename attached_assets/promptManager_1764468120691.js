// promptManager.js

// Section 1: Customer Concern Follow-Up Prompt with Limit
export function generateFollowUpPrompt(customerConcern) {
    // Limiting the number of questions to 5
    const limit = 5;
    
    return `You are assisting a service advisor who is speaking directly with a customer 
    about their vehicle's issue. The customer's concern is: "${customerConcern}". 
    
    Based on this concern, what follow-up questions (limit: ${limit}) should the service 
    advisor ask the customer to gather detailed information for the technician to diagnose 
    the problem more accurately? Please limit the number of questions to ${limit} to gain 
    more clarity on the issue.`;
}

// Section 2: Review of Conversation for Additional Questions with Limit
export function generateReviewPrompt(
    customerConcern, 
    answeredQuestions, 
    activeResponses
  ) {
      // Limiting the number of questions to 5
      const limit = 5;

      return `You are assisting a service advisor who is speaking directly with a customer 
      to gather more details about their vehicle issue. 
      
      Here is the entire conversation so far:
      \nCustomer Concern: ${customerConcern}
      \n\nFollow-Up Questions and Responses:
      \n${answeredQuestions.map(r => `Q: ${r.question}\nA: ${r.response}`).join('\n\n')}
      \n\nPrevious Follow-Up:
      \n${activeResponses.map(r => `Q: ${r.question}\nA: ${r.response}`).join('\n\n')}
      
      Based on the above conversation, what additional follow-up questions or information 
      (limit: ${limit}) should the service advisor ask the customer to further clarify the issue? 
      Please avoid questions that have already been answered and limit the number of new 
      questions to ${limit}.`;
  }


// Function to create a prompt for cleaning up the active conversation
export function generateCleanConversationPrompt(conversationText) {
    return `You are assisting in reviewing a conversation. The conversation so far is as follows:
    
    ${conversationText}
    
    Please clean up this conversation into a clear, concise, and natural paragraph-style format. Ensure that the flow is smooth without extra labels like "Service Advisor" or "Customer."`;
}
