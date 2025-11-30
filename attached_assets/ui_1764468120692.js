import { getPredictions } from './aiInteraction.js';
import { generateFollowUpPrompt, generateReviewPrompt, generateCleanConversationPrompt } from './promptManager.js';

/**
 * Section 1: Handle Customer Concern Submission
 */

// Function to handle the submission of a customer concern
export function handleSubmitConcern() {
    // Clear previous conversation history here to start fresh
    document.getElementById('activeConversation').innerHTML = ''; 

    const inputText = document.getElementById('concernInput').value;
    if (inputText) {
        const prompt = generateFollowUpPrompt(inputText); // Use promptManager to generate the prompt
        getPredictions(prompt).then(suggestions => {
            displayFollowUpList(suggestions);
        });
    }
}

// New logic: Add event listener for pressing Enter key in the concern input field
document.getElementById('concernInput').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevents the default behavior (like line break)
        handleSubmitConcern(); // Triggers the concern submission
    }
});

/**
 * Section 2: Display Follow-Up Questions
 */
export function displayFollowUpList(questions) {
    const listDiv = document.getElementById('followUpList');
    if (listDiv) {
        listDiv.innerHTML = ''; // Clear previous list

        questions.forEach((question) => {
            if (isValidQuestion(question)) {
                const questionDiv = document.createElement('div');
                questionDiv.classList.add('follow-up-item');
        
                // Clean question by removing "Q: ", number prefixes, and leading dashes
                const cleanQuestion = question.replace(/^Q:\s*/, "").replace(/^\d+\.\s*/, "").replace(/^-\s*/, "");
        
                const label = document.createElement('label');
                label.textContent = cleanQuestion;
        
                const inputContainer = document.createElement('div');
                inputContainer.classList.add('input-container');
        
                const textarea = document.createElement('textarea');
                textarea.placeholder = '';
                textarea.classList.add('input-box');
                textarea.style.width = '100%';
                textarea.style.minHeight = '40px';
                textarea.style.resize = 'vertical';
        
                questionDiv.appendChild(label);
                questionDiv.appendChild(inputContainer);
                inputContainer.appendChild(textarea);
                listDiv.appendChild(questionDiv);
            }
        });
        

        const notesDiv = document.createElement('div');
        notesDiv.classList.add('additional-notes');

        const notesLabel = document.createElement('label');
        notesLabel.textContent = "Additional Customer Notes";

        const notesTextarea = document.createElement('textarea');
        notesTextarea.placeholder = 'Enter additional customer notes...';
        notesTextarea.classList.add('input-box');
        notesTextarea.style.width = '100%';
        notesTextarea.style.minHeight = '60px';
        notesTextarea.style.resize = 'vertical';

        notesDiv.appendChild(notesLabel);
        notesDiv.appendChild(notesTextarea);
        listDiv.appendChild(notesDiv);
    } else {
        console.error('Follow-up list div not found');
    }
}

function isValidQuestion(question) {
    if (question.startsWith("Your service advisor could ask") || 
        question.startsWith("To gather more information")) {
        return false;
    }
    return question.trim().endsWith('?');
}

/**
 * Section 3: Handling Done and Submit for Review
 */
export function handleDone() {
    const concern = document.getElementById('concernInput').value;

    if (concern) {
        console.log("Done button clicked: Capturing customer concern:", concern);
        moveAnsweredToActive(concern);
    } else {
        console.error("No customer concern found in the input field.");
    }
}

export function submitConversationForReview() {
    const concern = document.getElementById('concernInput').value;
    const responses = gatherAnsweredFollowUpQuestions();

    if (responses.length > 0) {
        const activeResponses = gatherActiveConversation();
        
        const prompt = generateReviewPrompt(concern, responses, activeResponses);

        moveAnsweredToActive(concern);

        getPredictions(prompt).then(suggestions => {
            displayFollowUpList(suggestions);
        });
    }
}

function gatherAnsweredFollowUpQuestions() {
    const listDiv = document.getElementById('followUpList');
    const responses = [];

    listDiv.querySelectorAll('.follow-up-item').forEach(item => {
        const question = item.querySelector('label').textContent;
        const answer = item.querySelector('textarea').value;
        if (answer) {
            responses.push({ question, response: answer });
        }
    });

    const notesTextarea = listDiv.querySelector('.additional-notes textarea');
    if (notesTextarea && notesTextarea.value) {
        responses.push({ question: "Additional Customer Notes", response: notesTextarea.value });
    }

    return responses;
}

function gatherActiveConversation() {
    const activeConversationDiv = document.getElementById('activeConversation');
    const responses = [];

    activeConversationDiv.querySelectorAll('.active-question').forEach(questionDiv => {
        const question = questionDiv.querySelector('label').textContent;
        const response = questionDiv.querySelector('input').value;
        responses.push({ question, response });
    });

    return responses;
}

/**
 * Section 4: Move Answered Questions to Active Conversation (Paragraph Style)
 */
function moveAnsweredToActive(originalConcern) {
    const answeredQuestions = gatherAnsweredFollowUpQuestions();
    const activeConversationDiv = document.getElementById('activeConversation');

    let conversationText = `Customer Concern: "${originalConcern}".\n\n`;

    answeredQuestions.forEach(({ question, response }) => {
        conversationText += `Service Advisor: "${question}", Customer: "${response}".\n\n`;
    });

    conversationText = conversationText.charAt(0).toUpperCase() + conversationText.slice(1);

    const conversationParagraph = document.createElement('p');
    conversationParagraph.textContent = conversationText;
    activeConversationDiv.appendChild(conversationParagraph);

    document.getElementById('followUpList').innerHTML = '';
}

/**
 * Section 5: Copy Conversation
 */
export function copyConversation() {
    const activeConversationDiv = document.getElementById('activeConversation');
    let conversationText = '';

    activeConversationDiv.querySelectorAll('p').forEach(paragraph => {
        conversationText += paragraph.textContent + '\n\n';
    });

    const prompt = generateCleanConversationPrompt(conversationText);

    getPredictions(prompt).then(cleanedConversation => {
        
        const maxLength = 1000;

        function splitConversation(text, limit) {
            let parts = [];
            while (text.length > limit) {
                let splitIndex = text.lastIndexOf(' ', limit);
                if (splitIndex === -1) splitIndex = limit;
                parts.push(text.slice(0, splitIndex));
                text = text.slice(splitIndex).trim();
            }
            parts.push(text);
            return parts;
        }

        const conversationParts = splitConversation(cleanedConversation, maxLength);
        let currentPart = 0;

        function copyNextPart() {
            if (currentPart < conversationParts.length) {
                navigator.clipboard.writeText(conversationParts[currentPart]).then(() => {
                    if (currentPart < conversationParts.length - 1) {
                        if (confirm("Part copied to clipboard. Click OK to copy the next part.")) {
                            currentPart++;
                            copyNextPart();
                        }
                    } else {
                        alert("All conversation parts have been copied to the clipboard.");
                    }
                });
            }
        }

        copyNextPart();

    }).catch(err => {
        console.error("Error cleaning conversation with OpenAI:", err);
        navigator.clipboard.writeText(conversationText).then(() => {
            alert('Original conversation copied to clipboard');
        });
    });
}

/**
 * Section 6: Clear Form
 */
export function clearForm() {
    document.getElementById('concernInput').value = '';

    const listDiv = document.getElementById('followUpList');
    if (listDiv) {
        listDiv.innerHTML = '';
    }

    const activeConversationDiv = document.getElementById('activeConversation');
    if (activeConversationDiv) {
        activeConversationDiv.innerHTML = '';
    }
}

/**
 * Section 7: Send message listener to clear form from the Add AI Concern button
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'clearFormInSidePanel') {
        clearForm();
    }
});

export function sendToTekmetric() {
    const activeConversationDiv = document.getElementById('activeConversation');
    let conversationText = '';

    activeConversationDiv.querySelectorAll('p').forEach(paragraph => {
        conversationText += paragraph.textContent + '\n\n';
    });

    console.log('Active conversation collected:', conversationText);

    const prompt = generateCleanConversationPrompt(conversationText);
    console.log('Sending conversation to OpenAI with prompt:', prompt);

    getPredictions(prompt).then(cleanedConversation => {
        console.log('Received cleaned conversation from OpenAI:', cleanedConversation);

        chrome.runtime.sendMessage({
            action: 'sendToTekmetric',
            cleanedConversation: cleanedConversation
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message to background script:', chrome.runtime.lastError);
            } else {
                console.log('Message sent successfully to background script.');
            }
        });
    }).catch(err => {
        console.error("Error cleaning conversation with OpenAI:", err);
    });
}
