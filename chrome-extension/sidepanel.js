// HEART Helper Side Panel
// Provides Incoming Caller flow and AI Sales Script generation

let appUrl = '';
let phoneScript = 'Thank you for calling HEART Certified Auto Care, this is [Name], how may I help you?';
let currentTab = 'incoming';

// User Authentication State
let currentUser = null;
let isAuthenticated = false;

// Incoming Caller State
let customerName = '';
let referralSource = '';
let symptoms = [];
let vehicleInfo = { year: '', make: '', model: '' };
let followUpQuestions = [];
let answeredQuestions = [];
let currentQuestionIndex = 0;
let cleanedConversation = '';

// Sales Script State
let currentRO = null;
let lastGeneratedScript = null;

// Search State
let searchResults = [];
let selectedJobResult = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
  await checkAuthStatus();
  await syncSettingsFromApp();
  setupMessageListeners();
  requestCurrentROInfo();
});

// ==================== AUTHENTICATION ====================

async function checkAuthStatus() {
  if (!appUrl) {
    updateUserDisplay(null);
    return;
  }
  
  try {
    const response = await fetch(`${appUrl}/api/auth/user`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      currentUser = await response.json();
      isAuthenticated = true;
      updateUserDisplay(currentUser);
    } else {
      currentUser = null;
      isAuthenticated = false;
      updateUserDisplay(null);
    }
  } catch (error) {
    console.log('Could not check auth status:', error);
    currentUser = null;
    isAuthenticated = false;
    updateUserDisplay(null);
  }
}

function updateUserDisplay(user) {
  const userSection = document.getElementById('userSection');
  if (!userSection) return;
  
  if (user) {
    const initials = (user.firstName?.[0] || '') + (user.lastName?.[0] || '');
    const displayName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email;
    userSection.innerHTML = `
      <div class="user-info">
        <div class="user-avatar">${initials || '?'}</div>
        <div class="user-details">
          <div class="user-name">${displayName}</div>
          <div class="user-email">${user.email || ''}</div>
        </div>
      </div>
    `;
    userSection.style.display = 'flex';
  } else {
    userSection.innerHTML = `
      <div class="user-info login-prompt">
        <a href="${appUrl || '#'}" target="_blank" class="login-link">Sign in to save preferences</a>
      </div>
    `;
    userSection.style.display = 'flex';
  }
}

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
    document.getElementById('phoneScript').textContent = phoneScript;
    return;
  }
  
  try {
    new URL(appUrl);
  } catch {
    document.getElementById('phoneScript').textContent = phoneScript;
    return;
  }
  
  try {
    const response = await fetch(`${appUrl}/api/settings`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const settings = await response.json();
      if (settings.phoneAnswerScript) {
        phoneScript = settings.phoneAnswerScript;
        chrome.storage.local.set({ cachedPhoneScript: phoneScript });
      }
    } else {
      // Try cached
      const cached = await new Promise(r => chrome.storage.local.get(['cachedPhoneScript'], r));
      if (cached.cachedPhoneScript) phoneScript = cached.cachedPhoneScript;
    }
  } catch (error) {
    console.log('Could not sync settings:', error);
    const cached = await new Promise(r => chrome.storage.local.get(['cachedPhoneScript'], r));
    if (cached.cachedPhoneScript) phoneScript = cached.cachedPhoneScript;
  }
  
  document.getElementById('phoneScript').textContent = phoneScript;
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VEHICLE_INFO') {
      document.getElementById('vehicleYear').value = message.vehicleInfo.year || '';
      document.getElementById('vehicleMake').value = message.vehicleInfo.make || '';
      document.getElementById('vehicleModel').value = message.vehicleInfo.model || '';
    }
    if (message.type === 'RO_INFO') {
      currentRO = message.roInfo;
      updateRODisplay();
    }
  });
}

function requestCurrentROInfo() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('tekmetric.com')) {
      // Get vehicle info
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VEHICLE_INFO' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not get vehicle info:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.vehicleInfo) {
          document.getElementById('vehicleYear').value = response.vehicleInfo.year || '';
          document.getElementById('vehicleMake').value = response.vehicleInfo.make || '';
          document.getElementById('vehicleModel').value = response.vehicleInfo.model || '';
        }
      });
      
      // Get RO info for sales script
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_RO_INFO' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not get RO info:', chrome.runtime.lastError.message);
          return;
        }
        if (response && response.roInfo) {
          currentRO = response.roInfo;
          updateRODisplay();
        }
      });
    } else {
      console.log('Not on a Tekmetric page');
    }
  });
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  
  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    syncSettingsFromApp();
    requestCurrentROInfo();
    showToast('Refreshed!');
  });
  
  // Copy phone script
  document.getElementById('copyScriptBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(phoneScript);
    showToast('Phone script copied!');
  });
  
  // Add symptom
  document.getElementById('addSymptomBtn').addEventListener('click', addSymptomField);
  
  // Start conversation
  document.getElementById('startConversationBtn').addEventListener('click', startConversation);
  
  // Question navigation
  document.getElementById('nextQuestionBtn').addEventListener('click', nextQuestion);
  document.getElementById('skipQuestionBtn').addEventListener('click', skipQuestion);
  document.getElementById('finalizeEarlyBtn').addEventListener('click', finalizeConversation);
  
  // Summary actions
  document.getElementById('copyBtn').addEventListener('click', copySummary);
  document.getElementById('sendToTekmetricBtn').addEventListener('click', sendToTekmetric);
  document.getElementById('restartBtn').addEventListener('click', restart);
  
  // Sales script
  document.getElementById('generateSalesScriptBtn').addEventListener('click', generateSalesScript);
  document.getElementById('copySalesScriptBtn').addEventListener('click', copySalesScript);
  document.getElementById('regenerateBtn').addEventListener('click', generateSalesScript);
  document.getElementById('feedbackSuccess').addEventListener('click', () => submitFeedback('positive'));
  document.getElementById('feedbackFail').addEventListener('click', () => submitFeedback('negative'));
  
  // Search
  document.getElementById('searchBtn').addEventListener('click', performSearch);
  document.getElementById('clearSearchBtn').addEventListener('click', clearSearch);
  document.getElementById('backToResultsBtn').addEventListener('click', backToResults);
  document.getElementById('searchRepairType').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  // Settings
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('settingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'settingsModal') closeSettings();
  });
}

// ==================== TAB SWITCHING ====================

function switchTab(tab) {
  currentTab = tab;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  document.getElementById('incomingTab').style.display = tab === 'incoming' ? 'flex' : 'none';
  document.getElementById('searchTab').style.display = tab === 'search' ? 'flex' : 'none';
  document.getElementById('salesTab').style.display = tab === 'sales' ? 'flex' : 'none';
  
  // Auto-fill vehicle info when switching to search tab
  if (tab === 'search') {
    autoFillSearchVehicle();
  }
  
  // Auto-generate sales script when switching to sales tab
  if (tab === 'sales' && currentRO && currentRO.jobs && currentRO.jobs.length > 0 && appUrl) {
    // Only auto-generate if we haven't already generated
    const scriptSection = document.getElementById('salesScriptSection');
    if (scriptSection.style.display === 'none') {
      generateSalesScript();
    }
  }
}

// ==================== INCOMING CALLER FLOW ====================

function addSymptomField() {
  const list = document.getElementById('symptomsList');
  const row = document.createElement('div');
  row.className = 'symptom-input-row';
  row.innerHTML = `
    <input type="text" class="symptom-input" placeholder="Describe another issue..." />
    <button class="remove-symptom-btn" onclick="this.parentElement.remove()">×</button>
  `;
  list.appendChild(row);
  row.querySelector('input').focus();
}

function collectSymptoms() {
  symptoms = [];
  document.querySelectorAll('.symptom-input').forEach(input => {
    const val = input.value.trim();
    if (val) symptoms.push(val);
  });
  return symptoms;
}

async function startConversation() {
  customerName = document.getElementById('customerName').value.trim();
  referralSource = document.getElementById('referralSource').value.trim();
  collectSymptoms();
  vehicleInfo = {
    year: document.getElementById('vehicleYear').value.trim(),
    make: document.getElementById('vehicleMake').value.trim(),
    model: document.getElementById('vehicleModel').value.trim()
  };
  
  if (symptoms.length === 0) {
    showToast('Please enter at least one symptom/issue');
    return;
  }
  
  if (!appUrl) {
    showToast('Please configure app URL in settings');
    return;
  }
  
  // Show questions step
  document.getElementById('customerInfoStep').style.display = 'none';
  document.getElementById('questionsStep').style.display = 'block';
  
  // Show customer summary
  let summaryHtml = '';
  if (customerName) summaryHtml += `<strong>${customerName}</strong>`;
  if (vehicleInfo.year || vehicleInfo.make || vehicleInfo.model) {
    summaryHtml += ` - ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`.trim();
  }
  summaryHtml += `<br>Issues: ${symptoms.join(', ')}`;
  document.getElementById('customerSummary').innerHTML = summaryHtml;
  
  // Generate questions
  await generateQuestions();
}

async function generateQuestions() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.style.display = 'flex';
  
  try {
    const concernText = symptoms.join('. ');
    const response = await fetch(`${appUrl}/api/concerns/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerConcern: concernText,
        vehicleInfo: vehicleInfo
      })
    });
    
    if (!response.ok) throw new Error('Failed to generate questions');
    
    const data = await response.json();
    followUpQuestions = data.questions || [];
    
    if (followUpQuestions.length === 0) {
      // No questions, go straight to summary
      finalizeConversation();
      return;
    }
    
    currentQuestionIndex = 0;
    answeredQuestions = [];
    displayCurrentQuestion();
    
  } catch (error) {
    console.error('Error generating questions:', error);
    showToast('Could not generate questions. Finalizing...');
    finalizeConversation();
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function displayCurrentQuestion() {
  document.getElementById('questionNum').textContent = currentQuestionIndex + 1;
  document.getElementById('totalQuestions').textContent = followUpQuestions.length;
  document.getElementById('currentQuestion').textContent = followUpQuestions[currentQuestionIndex];
  document.getElementById('customerAnswer').value = '';
  document.getElementById('customerAnswer').focus();
  
  // Update step indicators
  document.querySelectorAll('.step-indicator .step').forEach((el, i) => {
    el.classList.toggle('active', i === 0);
    el.classList.remove('completed');
  });
}

function nextQuestion() {
  const answer = document.getElementById('customerAnswer').value.trim();
  if (!answer) {
    showToast('Please enter the customer\'s answer');
    return;
  }
  
  answeredQuestions.push({
    question: followUpQuestions[currentQuestionIndex],
    answer: answer
  });
  
  updateAnsweredList();
  
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

function updateAnsweredList() {
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
  }
}

async function finalizeConversation() {
  const loadingOverlay = document.getElementById('loadingOverlay');
  loadingOverlay.style.display = 'flex';
  loadingOverlay.querySelector('.loading-text').textContent = 'Finalizing...';
  
  try {
    const concernText = symptoms.join('. ');
    const response = await fetch(`${appUrl}/api/concerns/clean-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerConcern: concernText,
        answeredQuestions: answeredQuestions,
        conversationNotes: `Customer: ${customerName || 'Unknown'}. Referral: ${referralSource || 'Not specified'}. Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`.trim()
      })
    });
    
    if (!response.ok) throw new Error('Failed to finalize');
    
    const data = await response.json();
    cleanedConversation = data.cleanedText || symptoms.join('. ');
    
  } catch (error) {
    console.error('Error finalizing:', error);
    // Fallback to basic format
    cleanedConversation = `Customer reports: ${symptoms.join('. ')}`;
    if (answeredQuestions.length > 0) {
      cleanedConversation += '\n\n' + answeredQuestions.map(qa => `${qa.question}: ${qa.answer}`).join('\n');
    }
  } finally {
    loadingOverlay.style.display = 'none';
  }
  
  // Show summary section
  document.getElementById('questionSection').style.display = 'none';
  document.getElementById('summarySection').style.display = 'block';
  document.getElementById('summaryText').textContent = cleanedConversation;
  
  // Update step indicators
  document.querySelectorAll('.step-indicator .step').forEach((el, i) => {
    if (i === 0) el.classList.add('completed');
    el.classList.toggle('active', i === 1);
  });
}

function copySummary() {
  navigator.clipboard.writeText(cleanedConversation);
  showToast('Copied to clipboard!');
}

function sendToTekmetric() {
  // Send cleaned conversation to content script to paste into Tekmetric
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes('tekmetric.com')) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: 'PASTE_CONCERN', 
        text: cleanedConversation 
      });
      showToast('Sent to Tekmetric!');
    } else {
      navigator.clipboard.writeText(cleanedConversation);
      showToast('Copied! Switch to Tekmetric to paste.');
    }
  });
}

function restart() {
  // Reset state
  customerName = '';
  referralSource = '';
  symptoms = [];
  vehicleInfo = { year: '', make: '', model: '' };
  followUpQuestions = [];
  answeredQuestions = [];
  currentQuestionIndex = 0;
  cleanedConversation = '';
  
  // Reset UI
  document.getElementById('customerName').value = '';
  document.getElementById('referralSource').value = '';
  document.getElementById('vehicleYear').value = '';
  document.getElementById('vehicleMake').value = '';
  document.getElementById('vehicleModel').value = '';
  
  // Reset symptoms list to single input
  const symptomsList = document.getElementById('symptomsList');
  symptomsList.innerHTML = `
    <div class="symptom-input-row">
      <input type="text" class="symptom-input" placeholder="Describe the issue..." />
      <button class="add-symptom-btn" id="addSymptomBtn">+</button>
    </div>
  `;
  document.getElementById('addSymptomBtn').addEventListener('click', addSymptomField);
  
  // Reset sections
  document.getElementById('questionSection').style.display = 'block';
  document.getElementById('summarySection').style.display = 'none';
  document.getElementById('answeredQuestions').style.display = 'none';
  document.getElementById('answeredList').innerHTML = '';
  
  // Show customer info step
  document.getElementById('questionsStep').style.display = 'none';
  document.getElementById('customerInfoStep').style.display = 'block';
  
  // Refresh vehicle info from current page
  requestCurrentROInfo();
}

// ==================== SALES SCRIPT ====================

function updateRODisplay() {
  const details = document.getElementById('roDetails');
  const noRoMessage = document.getElementById('noRoMessage');
  const scriptSection = document.getElementById('salesScriptSection');
  
  if (!currentRO || !currentRO.jobs || currentRO.jobs.length === 0) {
    details.innerHTML = '';
    noRoMessage.style.display = 'block';
    scriptSection.style.display = 'none';
    return;
  }
  
  noRoMessage.style.display = 'none';
  
  let html = '';
  if (currentRO.vehicle) {
    const vehicleStr = `${currentRO.vehicle.year || ''} ${currentRO.vehicle.make || ''} ${currentRO.vehicle.model || ''}`.trim();
    if (vehicleStr) {
      html += `<div class="ro-vehicle">${vehicleStr}</div>`;
    }
  }
  
  details.innerHTML = html;
  
  // Auto-generate sales script when RO is loaded and we're on the sales tab
  if (currentTab === 'sales' && appUrl) {
    generateSalesScript();
  }
}

async function generateSalesScript() {
  if (!currentRO || !currentRO.jobs) {
    showToast('No repair order data available');
    return;
  }
  
  if (!appUrl) {
    showToast('Please configure app URL in settings');
    return;
  }
  
  const loadingOverlay = document.getElementById('salesLoadingOverlay');
  loadingOverlay.style.display = 'flex';
  
  try {
    // Include credentials to send session cookie for personalized training data
    const response = await fetch(`${appUrl}/api/sales/generate-script`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicle: currentRO.vehicle,
        jobs: currentRO.jobs,
        customer: currentRO.customer,
        totalAmount: currentRO.totalAmount,
        isInShop: currentRO.isInShop
      })
    });
    
    if (!response.ok) throw new Error('Failed to generate sales script');
    
    const data = await response.json();
    displaySalesScript(data.script);
    
    // Show personalization indicator only when personal training was actually used
    const section = document.getElementById('salesScriptSection');
    const existingBadge = section.querySelector('.personalized-badge');
    
    if (data.usedPersonalTraining) {
      if (!existingBadge) {
        const badge = document.createElement('span');
        badge.className = 'personalized-badge';
        badge.title = 'Script personalized using your training data';
        badge.textContent = 'Personalized';
        const header = section.querySelector('.script-header');
        if (header) {
          // Insert before the refresh button
          const refreshBtn = header.querySelector('.refresh-script-btn');
          if (refreshBtn) {
            header.insertBefore(badge, refreshBtn);
          } else {
            header.appendChild(badge);
          }
        }
      }
    } else if (existingBadge) {
      // Remove badge if not using personal training
      existingBadge.remove();
    }
    
  } catch (error) {
    console.error('Error generating sales script:', error);
    showToast('Could not generate sales script');
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function displaySalesScript(script) {
  const section = document.getElementById('salesScriptSection');
  const content = document.getElementById('salesScriptContent');
  const noRoMessage = document.getElementById('noRoMessage');
  
  // Display as plain text (no HTML)
  content.textContent = script;
  section.style.display = 'block';
  noRoMessage.style.display = 'none';
}

function copySalesScript() {
  const content = document.getElementById('salesScriptContent').innerText;
  navigator.clipboard.writeText(content);
  showToast('Sales script copied!');
}

async function submitFeedback(sentiment) {
  const scriptContent = document.getElementById('salesScriptContent').innerText;
  
  if (!appUrl) {
    showToast(sentiment === 'positive' ? 'Great! Thanks for the feedback.' : 'Thanks for the feedback!');
    return;
  }
  
  // Visual feedback immediately
  const successBtn = document.getElementById('feedbackSuccess');
  const failBtn = document.getElementById('feedbackFail');
  
  if (sentiment === 'positive') {
    successBtn.classList.add('selected');
    failBtn.classList.remove('selected');
  } else {
    failBtn.classList.add('selected');
    successBtn.classList.remove('selected');
  }
  
  if (!isAuthenticated) {
    showToast(sentiment === 'positive' ? 'Great! Sign in to save feedback.' : 'Thanks! Sign in to save feedback.');
    return;
  }
  
  try {
    // Build vehicle info string if available
    const vehicleStr = currentRO?.vehicle ? 
      `${currentRO.vehicle.year || ''} ${currentRO.vehicle.make || ''} ${currentRO.vehicle.model || ''}`.trim() : null;
    
    // Build repair type string from jobs
    const repairStr = currentRO?.jobs?.length > 0 ? 
      currentRO.jobs.map(j => j.name || j.jobName).filter(Boolean).join(', ') : null;
    
    const response = await fetch(`${appUrl}/api/scripts/feedback`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scriptType: 'sales',
        repairOrderId: currentRO?.repairOrderId || null,
        sentiment: sentiment,
        outcome: sentiment === 'positive' ? 'approved' : 'declined',
        scriptContent: scriptContent || null,
        vehicleInfo: vehicleStr,
        repairType: repairStr
      })
    });
    
    if (response.ok) {
      showToast(sentiment === 'positive' ? 'Great! Feedback saved.' : 'Thanks! Feedback saved.');
    } else if (response.status === 401) {
      isAuthenticated = false;
      currentUser = null;
      updateUserDisplay(null);
      showToast('Session expired. Please sign in again.');
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('Feedback error:', errorData);
      throw new Error('Failed to save feedback');
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);
    showToast(sentiment === 'positive' ? 'Great! Thanks for the feedback.' : 'Thanks for the feedback!');
  }
}

// ==================== SEARCH ====================

const SHOP_NAMES = {
  NB: 'Northbrook',
  WM: 'Wilmette',
  EV: 'Evanston'
};

function autoFillSearchVehicle() {
  // Auto-fill from current RO vehicle info if available
  if (currentRO && currentRO.vehicle) {
    const searchYear = document.getElementById('searchYear');
    const searchMake = document.getElementById('searchMake');
    const searchModel = document.getElementById('searchModel');
    
    if (!searchYear.value && currentRO.vehicle.year) {
      searchYear.value = currentRO.vehicle.year;
    }
    if (!searchMake.value && currentRO.vehicle.make) {
      searchMake.value = currentRO.vehicle.make;
    }
    if (!searchModel.value && currentRO.vehicle.model) {
      searchModel.value = currentRO.vehicle.model;
    }
  }
}

async function performSearch() {
  const repairType = document.getElementById('searchRepairType').value.trim();
  
  if (!repairType) {
    showToast('Please enter a repair type');
    return;
  }
  
  if (!appUrl) {
    showToast('Please configure app URL in settings');
    return;
  }
  
  const loadingOverlay = document.getElementById('searchLoadingOverlay');
  loadingOverlay.style.display = 'flex';
  
  try {
    const params = {
      repairType: repairType,
      vehicleYear: document.getElementById('searchYear').value.trim() || undefined,
      vehicleMake: document.getElementById('searchMake').value.trim() || undefined,
      vehicleModel: document.getElementById('searchModel').value.trim() || undefined,
      vehicleEngine: document.getElementById('searchEngine').value.trim() || undefined,
      limit: 20
    };
    
    // Remove undefined values
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
    
    const response = await fetch(`${appUrl}/api/search`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        showToast('Please sign in to search');
        return;
      }
      if (response.status === 403) {
        showToast('Account pending approval');
        return;
      }
      throw new Error('Search failed');
    }
    
    const data = await response.json();
    searchResults = data.results || [];
    displaySearchResults();
    
  } catch (error) {
    console.error('Search error:', error);
    showToast('Search failed. Please try again.');
  } finally {
    loadingOverlay.style.display = 'none';
  }
}

function displaySearchResults() {
  const emptyState = document.getElementById('searchEmptyState');
  const resultsSection = document.getElementById('searchResultsSection');
  const resultsList = document.getElementById('searchResultsList');
  const resultsCount = document.getElementById('resultsCount');
  const jobDetailSection = document.getElementById('jobDetailSection');
  const formSection = document.querySelector('.search-form-section');
  
  // Hide job detail, show form
  jobDetailSection.style.display = 'none';
  formSection.style.display = 'block';
  
  if (searchResults.length === 0) {
    emptyState.style.display = 'none';
    resultsSection.style.display = 'flex';
    resultsList.innerHTML = `
      <div class="no-results-state">
        <div class="no-results-icon">&#128269;</div>
        <div class="no-results-title">No Matching Jobs Found</div>
        <div class="no-results-desc">Try adjusting your search criteria or broadening your vehicle details.</div>
      </div>
    `;
    resultsCount.textContent = '0 results';
    return;
  }
  
  emptyState.style.display = 'none';
  resultsSection.style.display = 'flex';
  resultsCount.textContent = `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`;
  
  resultsList.innerHTML = searchResults.map((result, index) => {
    const { job, matchScore, matchReason } = result;
    const vehicle = job.vehicle;
    const laborHours = job.laborItems.reduce((sum, item) => sum + Number(item.hours || 0), 0);
    const partsCount = job.parts.length;
    const shopId = job.repairOrder?.shopId;
    const shopName = shopId && SHOP_NAMES[shopId] ? SHOP_NAMES[shopId] : null;
    
    const matchClass = matchScore >= 80 ? 'high' : matchScore >= 60 ? 'medium' : 'low';
    const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : '';
    
    return `
      <div class="job-result-card" data-index="${index}">
        <div class="job-card-header">
          <div>
            ${vehicleStr ? `<div class="job-card-vehicle">${vehicleStr}</div>` : ''}
            <div class="job-card-name">${job.name}</div>
          </div>
          <span class="match-badge ${matchClass}">${matchScore}%</span>
        </div>
        ${matchReason ? `<div class="job-card-reason">${matchReason}</div>` : ''}
        <div class="job-card-meta">
          <div class="job-card-meta-item">
            <span class="job-card-meta-icon">&#128176;</span>
            ${formatCurrency(job.totalPrice)}
          </div>
          <div class="job-card-meta-item">
            <span class="job-card-meta-icon">&#128338;</span>
            ${laborHours.toFixed(1)} hrs
          </div>
          <div class="job-card-meta-item">
            <span class="job-card-meta-icon">&#128295;</span>
            ${partsCount} parts
          </div>
          ${shopName ? `<div class="job-card-meta-item"><span class="job-card-meta-icon">&#127970;</span>${shopName}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // Add click listeners to cards
  resultsList.querySelectorAll('.job-result-card').forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index);
      showJobDetail(searchResults[index]);
    });
  });
}

function showJobDetail(result) {
  selectedJobResult = result;
  const { job, matchScore, matchReason } = result;
  const vehicle = job.vehicle;
  const formSection = document.querySelector('.search-form-section');
  const resultsSection = document.getElementById('searchResultsSection');
  const jobDetailSection = document.getElementById('jobDetailSection');
  const detailContent = document.getElementById('jobDetailContent');
  
  formSection.style.display = 'none';
  resultsSection.style.display = 'none';
  jobDetailSection.style.display = 'flex';
  
  const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : '';
  const shopId = job.repairOrder?.shopId;
  const shopName = shopId && SHOP_NAMES[shopId] ? SHOP_NAMES[shopId] : null;
  
  // Calculate totals
  const laborTotal = job.laborItems.reduce((sum, item) => sum + Number(item.laborTotal || 0), 0);
  const partsTotal = job.parts.reduce((sum, part) => sum + Number(part.total || 0), 0);
  const totalHours = job.laborItems.reduce((sum, item) => sum + Number(item.hours || 0), 0);
  
  let html = `
    <div class="job-detail-header">
      ${vehicleStr ? `<div class="job-detail-vehicle">${vehicleStr}${vehicle?.engine ? ` - ${vehicle.engine}` : ''}</div>` : ''}
      <div class="job-detail-name">${job.name}</div>
      <div class="job-detail-match">&#127942; ${matchScore}% Match</div>
      ${matchReason ? `<div class="job-detail-reason">${matchReason}</div>` : ''}
    </div>
  `;
  
  // Labor items
  if (job.laborItems.length > 0) {
    html += `<div class="job-detail-section-title">Labor (${totalHours.toFixed(1)} hrs)</div>`;
    job.laborItems.forEach(item => {
      html += `
        <div class="job-detail-item">
          <div class="job-detail-item-name">${item.name}</div>
          <div class="job-detail-item-meta">${item.hours} hrs @ ${formatCurrency(item.rate)}/hr = ${formatCurrency(item.laborTotal)}</div>
        </div>
      `;
    });
  }
  
  // Parts
  if (job.parts.length > 0) {
    html += `<div class="job-detail-section-title">Parts (${job.parts.length})</div>`;
    job.parts.forEach(part => {
      html += `
        <div class="job-detail-item">
          <div class="job-detail-item-name">${part.name || 'Part'}</div>
          <div class="job-detail-item-meta">
            ${part.partNumber ? `#${part.partNumber} - ` : ''}
            Qty ${part.quantity} @ ${formatCurrency(part.unitPrice)} = ${formatCurrency(part.total)}
          </div>
        </div>
      `;
    });
  }
  
  // Totals
  html += `
    <div class="job-detail-totals">
      <div class="job-detail-total-row">
        <span>Labor</span>
        <span>${formatCurrency(laborTotal)}</span>
      </div>
      <div class="job-detail-total-row">
        <span>Parts</span>
        <span>${formatCurrency(partsTotal)}</span>
      </div>
      <div class="job-detail-total-row grand">
        <span>Total</span>
        <span>${formatCurrency(job.totalPrice)}</span>
      </div>
    </div>
  `;
  
  // RO info
  html += `
    <div class="job-detail-ro">
      RO #${job.repairOrderId}
      ${shopName ? `<span class="job-detail-shop">${shopName}</span>` : ''}
    </div>
  `;
  
  detailContent.innerHTML = html;
}

function backToResults() {
  const formSection = document.querySelector('.search-form-section');
  const resultsSection = document.getElementById('searchResultsSection');
  const jobDetailSection = document.getElementById('jobDetailSection');
  
  formSection.style.display = 'block';
  resultsSection.style.display = 'flex';
  jobDetailSection.style.display = 'none';
  selectedJobResult = null;
}

function clearSearch() {
  searchResults = [];
  selectedJobResult = null;
  
  document.getElementById('searchYear').value = '';
  document.getElementById('searchMake').value = '';
  document.getElementById('searchModel').value = '';
  document.getElementById('searchEngine').value = '';
  document.getElementById('searchRepairType').value = '';
  
  document.getElementById('searchResultsSection').style.display = 'none';
  document.getElementById('jobDetailSection').style.display = 'none';
  document.getElementById('searchEmptyState').style.display = 'flex';
  document.querySelector('.search-form-section').style.display = 'block';
}

function formatCurrency(cents) {
  if (cents === null || cents === undefined) return '$0.00';
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

// ==================== SETTINGS ====================

function updateConnectionStatus() {
  const dot = document.querySelector('.status-dot');
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

function openSettings() {
  document.getElementById('appUrlInput').value = appUrl || '';
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function saveSettings() {
  const newUrl = document.getElementById('appUrlInput').value.trim();
  
  if (newUrl) {
    try {
      new URL(newUrl);
    } catch {
      showToast('Please enter a valid URL');
      return;
    }
  }
  
  appUrl = newUrl;
  chrome.storage.sync.set({ heartHelperUrl: newUrl });
  chrome.storage.local.set({ appUrl: newUrl });
  
  updateConnectionStatus();
  closeSettings();
  showToast('Settings saved!');
  
  if (newUrl) {
    await syncSettingsFromApp();
  }
}

// ==================== UTILITIES ====================

function showToast(message) {
  const existing = document.querySelector('.copied-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'copied-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 2000);
}
