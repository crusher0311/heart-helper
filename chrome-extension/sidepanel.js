// HEART Helper Side Panel - Concern Intake
// Provides AI-powered diagnostic question generation during customer calls

let appUrl = '';
let currentStep = 1;
let customerConcern = '';
let followUpQuestions = [];
let answeredQuestions = [];
let currentQuestionIndex = 0;
let cleanedConversation = '';
let vehicleInfo = null;
let phoneScript = '';

// DOM Elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const loadingOverlay = document.getElementById('loadingOverlay');
const phoneScriptSection = document.getElementById('phoneScriptSection');
const phoneScriptEl = document.getElementById('phoneScript');
const vehicleInfoSection = document.getElementById('vehicleInfoSection');
const vehicleInfoEl = document.getElementById('vehicleInfo');
const connectionStatus = document.getElementById('connectionStatus');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  await syncSettingsFromApp();
  
  // Listen for messages from content script (vehicle info)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VEHICLE_INFO') {
      vehicleInfo = message.vehicleInfo;
      updateVehicleInfoDisplay();
    }
    if (message.type === 'INITIAL_CONCERN') {
      document.getElementById('customerConcern').value = message.concern || '';
    }
  });
  
  // Request current vehicle info from content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('tekmetric.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VEHICLE_INFO' });
    }
  });
});

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['heartHelperUrl'], (data) => {
      appUrl = data.heartHelperUrl || '';
      updateConnectionStatus();
      resolve();
    });
  });
}

async function syncSettingsFromApp() {
  if (!appUrl) {
    console.log('No app URL configured - cannot sync settings');
    showConnectionWarning('Configure app URL in extension popup');
    return;
  }
  
  // Validate URL format
  try {
    new URL(appUrl);
  } catch {
    console.log('Invalid app URL format:', appUrl);
    showConnectionWarning('Invalid app URL - check extension settings');
    return;
  }
  
  try {
    const response = await fetch(`${appUrl}/api/settings`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log('Settings API returned error:', response.status);
      loadCachedScript(true);
      return;
    }
    
    const settings = await response.json();
    if (settings.phoneAnswerScript) {
      phoneScript = settings.phoneAnswerScript;
      phoneScriptSection.style.display = 'block';
      phoneScriptEl.textContent = phoneScript;
      
      // Cache script for offline fallback
      chrome.storage.local.set({ cachedPhoneScript: phoneScript });
      console.log('Phone script synced from app');
    }
    
    // Clear any connection warning
    hideConnectionWarning();
  } catch (error) {
    console.log('Could not sync settings from app:', error);
    loadCachedScript(true);
  }
}

function loadCachedScript(showWarning = false) {
  chrome.storage.local.get(['cachedPhoneScript'], (data) => {
    if (data.cachedPhoneScript) {
      phoneScript = data.cachedPhoneScript;
      phoneScriptSection.style.display = 'block';
      phoneScriptEl.textContent = phoneScript;
      console.log('Using cached phone script');
      if (showWarning) {
        showConnectionWarning('Offline - using cached settings');
      }
    } else if (showWarning) {
      showConnectionWarning('Cannot connect to app - check your connection');
    }
  });
}

function showConnectionWarning(message) {
  let warning = document.getElementById('connectionWarning');
  if (!warning) {
    warning = document.createElement('div');
    warning.id = 'connectionWarning';
    warning.style.cssText = 'background:#fff3cd;border-bottom:1px solid #ffc107;padding:8px 16px;font-size:12px;color:#856404;display:flex;align-items:center;gap:6px;';
    warning.innerHTML = '<span style="font-size:14px;">&#9888;</span><span id="warningText"></span>';
    const container = document.querySelector('.panel-container');
    if (container) {
      container.insertBefore(warning, container.querySelector('.panel-header').nextSibling);
    }
  }
  document.getElementById('warningText').textContent = message;
  warning.style.display = 'flex';
}

function hideConnectionWarning() {
  const warning = document.getElementById('connectionWarning');
  if (warning) {
    warning.style.display = 'none';
  }
}

function setupEventListeners() {
  // Step 1: Generate questions
  document.getElementById('generateQuestionsBtn').addEventListener('click', generateQuestions);
  
  // Step 2: Answer questions
  document.getElementById('nextQuestionBtn').addEventListener('click', nextQuestion);
  document.getElementById('skipQuestionBtn').addEventListener('click', skipQuestion);
  document.getElementById('finalizeEarlyBtn').addEventListener('click', finalizeConversation);
  
  // Step 3: Actions
  document.getElementById('copyBtn').addEventListener('click', copyToClipboard);
  document.getElementById('sendToTekmetricBtn').addEventListener('click', sendToTekmetric);
  document.getElementById('restartBtn').addEventListener('click', restart);
  
  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  
  // Close modal when clicking outside
  document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') closeSettings();
  });
}

function openSettings() {
  document.getElementById('appUrlInput').value = appUrl || '';
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function saveSettings() {
  const newUrl = document.getElementById('appUrlInput').value.trim();
  
  // Validate URL if provided
  if (newUrl) {
    try {
      new URL(newUrl);
    } catch {
      showToast('Please enter a valid URL');
      return;
    }
  }
  
  appUrl = newUrl;
  
  // Save to both sync and local storage for compatibility
  chrome.storage.sync.set({ heartHelperUrl: newUrl });
  chrome.storage.local.set({ appUrl: newUrl });
  
  updateConnectionStatus();
  closeSettings();
  showToast('Settings saved!');
  
  // Try to sync settings from app
  if (newUrl) {
    await syncSettingsFromApp();
  }
}

function updateVehicleInfoDisplay() {
  if (vehicleInfo && (vehicleInfo.year || vehicleInfo.make || vehicleInfo.model)) {
    vehicleInfoSection.style.display = 'block';
    vehicleInfoEl.textContent = `${vehicleInfo.year || ''} ${vehicleInfo.make || ''} ${vehicleInfo.model || ''}`.trim();
  } else {
    vehicleInfoSection.style.display = 'none';
  }
}

function updateConnectionStatus() {
  const dot = connectionStatus.querySelector('.status-dot');
  const text = document.getElementById('connectionText');
  
  if (appUrl) {
    dot.className = 'status-dot connected';
    text.textContent = 'Connected';
    text.style.cursor = 'default';
    text.onclick = null;
  } else {
    dot.className = 'status-dot disconnected';
    text.innerHTML = 'Not connected - <u style="cursor:pointer">click to configure</u>';
    text.style.cursor = 'pointer';
    text.onclick = openSettings;
  }
}


function setStep(step) {
  currentStep = step;
  
  // Update step indicators
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'completed');
    if (i + 1 < step) el.classList.add('completed');
    if (i + 1 === step) el.classList.add('active');
  });
  
  // Show/hide step content
  step1.style.display = step === 1 ? 'block' : 'none';
  step2.style.display = step === 2 ? 'block' : 'none';
  step3.style.display = step === 3 ? 'block' : 'none';
}

function showLoading(show, text = 'Generating...') {
  loadingOverlay.style.display = show ? 'flex' : 'none';
  loadingOverlay.querySelector('.loading-text').textContent = text;
}

async function generateQuestions() {
  customerConcern = document.getElementById('customerConcern').value.trim();
  
  if (!customerConcern) {
    showToast('Please enter the customer\'s concern first');
    return;
  }
  
  if (!appUrl) {
    showToast('Please configure app URL in extension popup');
    return;
  }
  
  showLoading(true, 'Generating questions...');
  
  try {
    const response = await fetch(`${appUrl}/api/concerns/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerConcern,
        vehicleInfo
      })
    });
    
    if (!response.ok) throw new Error('Failed to generate questions');
    
    const data = await response.json();
    followUpQuestions = data.questions || [];
    currentQuestionIndex = 0;
    answeredQuestions = [];
    
    showLoading(false);
    setStep(2);
    displayCurrentQuestion();
  } catch (error) {
    console.error('Error generating questions:', error);
    showLoading(false);
    
    // Fallback questions
    followUpQuestions = [
      "When did you first notice this issue?",
      "Does it happen all the time or only sometimes?",
      "Have you noticed any other changes with your vehicle?",
      "Is this affecting your ability to drive safely?",
      "Have you had any recent work done on the vehicle?"
    ];
    currentQuestionIndex = 0;
    answeredQuestions = [];
    
    setStep(2);
    displayCurrentQuestion();
    showToast('Using default questions (offline mode)');
  }
}

function displayCurrentQuestion() {
  document.getElementById('questionNum').textContent = currentQuestionIndex + 1;
  document.getElementById('totalQuestions').textContent = followUpQuestions.length;
  document.getElementById('currentQuestion').textContent = followUpQuestions[currentQuestionIndex];
  document.getElementById('customerAnswer').value = '';
  
  // Update button text
  const nextBtn = document.getElementById('nextQuestionBtn');
  if (currentQuestionIndex >= followUpQuestions.length - 1) {
    nextBtn.innerHTML = '<span class="btn-icon">&#128196;</span> Finalize';
  } else {
    nextBtn.innerHTML = 'Next <span class="btn-arrow">&#8594;</span>';
  }
  
  // Update answered questions display
  updateAnsweredDisplay();
}

function updateAnsweredDisplay() {
  const container = document.getElementById('answeredQuestions');
  const list = document.getElementById('answeredList');
  
  if (answeredQuestions.length > 0) {
    container.style.display = 'block';
    list.innerHTML = answeredQuestions.map(qa => `
      <div class="answered-item">
        <div class="question">${qa.question}</div>
        <div class="answer">${qa.answer}</div>
      </div>
    `).join('');
  } else {
    container.style.display = 'none';
  }
}

function nextQuestion() {
  const answer = document.getElementById('customerAnswer').value.trim();
  
  if (!answer) {
    showToast('Please record the customer\'s answer');
    return;
  }
  
  answeredQuestions.push({
    question: followUpQuestions[currentQuestionIndex],
    answer
  });
  
  if (currentQuestionIndex < followUpQuestions.length - 1) {
    currentQuestionIndex++;
    displayCurrentQuestion();
  } else {
    finalizeConversation();
  }
}

function skipQuestion() {
  if (currentQuestionIndex < followUpQuestions.length - 1) {
    currentQuestionIndex++;
    displayCurrentQuestion();
  } else {
    finalizeConversation();
  }
}

async function finalizeConversation() {
  const notes = document.getElementById('additionalNotes')?.value.trim() || '';
  
  showLoading(true, 'Formatting summary...');
  
  try {
    const response = await fetch(`${appUrl}/api/concerns/clean-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerConcern,
        answeredQuestions,
        conversationNotes: notes
      })
    });
    
    if (!response.ok) throw new Error('Failed to clean conversation');
    
    const data = await response.json();
    cleanedConversation = data.cleanedText || '';
    
    showLoading(false);
    setStep(3);
    document.getElementById('summaryText').textContent = cleanedConversation;
  } catch (error) {
    console.error('Error cleaning conversation:', error);
    showLoading(false);
    
    // Fallback: simple concatenation
    cleanedConversation = `Customer reports: ${customerConcern}. ` +
      answeredQuestions.map(qa => qa.answer).join('. ');
    
    setStep(3);
    document.getElementById('summaryText').textContent = cleanedConversation;
    showToast('Using simple format (offline mode)');
  }
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(cleanedConversation);
    showToast('Copied to clipboard!');
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Copy failed - please select and copy manually');
  }
}

function sendToTekmetric() {
  // Send message to content script to add concern to RO
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('tekmetric.com')) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'ADD_CONCERN_TO_RO',
        concernText: cleanedConversation
      }, (response) => {
        if (chrome.runtime.lastError) {
          showToast('Could not communicate with Tekmetric page');
          return;
        }
        if (response && response.success) {
          showToast('Added to repair order!');
        } else {
          showToast('Could not find concern field on page');
        }
      });
    } else {
      showToast('Please open a Tekmetric repair order first');
    }
  });
}

function restart() {
  customerConcern = '';
  followUpQuestions = [];
  answeredQuestions = [];
  currentQuestionIndex = 0;
  cleanedConversation = '';
  
  document.getElementById('customerConcern').value = '';
  document.getElementById('customerAnswer').value = '';
  document.getElementById('additionalNotes').value = '';
  document.getElementById('answeredList').innerHTML = '';
  document.getElementById('answeredQuestions').style.display = 'none';
  
  setStep(1);
}

function showToast(message) {
  const existing = document.querySelector('.copied-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'copied-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 2000);
}
