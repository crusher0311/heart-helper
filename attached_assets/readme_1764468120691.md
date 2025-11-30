# AI Assistant Prompts - Overview

This document explains the key prompt sections in the `promptManager.js` file that are sent to OpenAI. These prompts are responsible for generating follow-up questions, reviewing conversations, and cleaning up the conversation text. 

## 1. Customer Concern Follow-Up Prompt
- **Purpose**: This prompt is used to generate follow-up questions based on the customer's concern to assist the service advisor.
- **Function**: `generateFollowUpPrompt(customerConcern)`
- **Description**: It takes the customer concern as input and returns a series of follow-up questions that help the service advisor gather more detailed information for the technician.

## 2. Review of Conversation for Additional Questions
- **Purpose**: This prompt is used to review the conversation history and suggest additional follow-up questions.
- **Function**: `generateReviewPrompt(customerConcern, answeredQuestions, activeResponses)`
- **Description**: It takes the customer concern, previously answered questions, and active responses, generating more follow-up questions to clarify the issue further.

## 3. Conversation Cleanup
- **Purpose**: This prompt is used to clean up and restructure the conversation text for better clarity and flow.
- **Function**: `generateCleanConversationPrompt(conversationText)`
- **Description**: It takes the entire conversation text and returns a cleaned-up version formatted into natural paragraph-style language without extra labels like "Service Advisor" or "Customer."

## Notes
- These functions are vital for maintaining the conversation's clarity and accuracy, ensuring the correct flow of information between the service advisor and the customer.
- Any modifications should be carefully tested to avoid disrupting the prompt generation process.
