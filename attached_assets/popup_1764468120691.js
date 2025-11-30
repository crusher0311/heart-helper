import { handleSubmitConcern, submitConversationForReview, handleDone, copyConversation, clearForm, sendToTekmetric } from './ui.js';

// Attach event listener for the Send to Tekmetric button
document.getElementById('sendToTekmetricButton').addEventListener('click', sendToTekmetric);

// Other event listeners
document.getElementById('submitConcernButton').addEventListener('click', handleSubmitConcern);
document.getElementById('clearFormButton').addEventListener('click', clearForm);
document.getElementById('submitForReviewButton').addEventListener('click', submitConversationForReview);
document.getElementById('doneButton').addEventListener('click', handleDone);
document.getElementById('copyConversationButton').addEventListener('click', copyConversation);
