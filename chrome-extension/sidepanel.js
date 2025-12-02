// HEART Helper Side Panel
// Provides Incoming Caller flow and AI Sales Script generation

let appUrl = '';
let phoneScript = 'Thank you for calling HEART Certified Auto Care, this is [Name], how may I help you?';
let currentTab = 'incoming';

// User Authentication State
let currentUser = null;
let isAuthenticated = false;
let sessionCookie = null;

// Helper to get session cookie using Chrome cookies API
async function getSessionCookie() {
  if (!appUrl) return null;
  try {
    // Debug: List all cookies for the domain
    const allCookies = await chrome.cookies.getAll({ url: appUrl });
    console.log('All cookies for', appUrl, ':', allCookies.map(c => c.name));
    
    const cookie = await chrome.cookies.get({
      url: appUrl,
      name: 'connect.sid'
    });
    if (cookie) {
      console.log('Session cookie found:', cookie.name, 'value length:', cookie.value.length);
      sessionCookie = cookie.value;
      return cookie.value;
    } else {
      console.log('No connect.sid cookie found for', appUrl);
      console.log('Make sure you are logged in at:', appUrl);
      return null;
    }
  } catch (error) {
    console.error('Error getting session cookie:', error);
    return null;
  }
}

// Wrapper for fetch that includes session cookie in header
async function authenticatedFetch(url, options = {}) {
  // Try to get cookie if we don't have it
  if (!sessionCookie) {
    await getSessionCookie();
  }
  
  const headers = {
    ...options.headers,
    'Accept': 'application/json',
  };
  
  // Add cookie header if we have a session
  if (sessionCookie) {
    headers['Cookie'] = `connect.sid=${sessionCookie}`;
  }
  
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}

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
  // Get session cookie first before checking auth
  await getSessionCookie();
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
  
  // Refresh cookie before checking
  await getSessionCookie();
  
  try {
    const response = await authenticatedFetch(`${appUrl}/api/auth/user`, {
      method: 'GET',
    });
    
    if (response.ok) {
      currentUser = await response.json();
      isAuthenticated = true;
      updateUserDisplay(currentUser);
      console.log('Auth check successful:', currentUser.email);
    } else {
      console.log('Auth check failed:', response.status);
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

// Normalize URL to just origin (strips any path like /settings)
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}

async function loadSettings() {
  return new Promise((resolve) => {
    // Check sync storage first (user-configured), then local storage (auto-detected from app visit)
    chrome.storage.sync.get(['heartHelperUrl'], (syncData) => {
      if (syncData.heartHelperUrl) {
        appUrl = normalizeUrl(syncData.heartHelperUrl);
        updateConnectionStatus();
        resolve();
      } else {
        // Fallback to local storage (set by inject.js when visiting the app)
        chrome.storage.local.get(['appUrl'], (localData) => {
          appUrl = normalizeUrl(localData.appUrl || '');
          updateConnectionStatus();
          resolve();
        });
      }
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
      // Update Incoming Caller tab vehicle fields
      document.getElementById('vehicleYear').value = message.vehicleInfo.year || '';
      document.getElementById('vehicleMake').value = message.vehicleInfo.make || '';
      document.getElementById('vehicleModel').value = message.vehicleInfo.model || '';
      // Also update Search tab vehicle fields
      document.getElementById('searchYear').value = message.vehicleInfo.year || '';
      document.getElementById('searchMake').value = message.vehicleInfo.make || '';
      document.getElementById('searchModel').value = message.vehicleInfo.model || '';
    }
    if (message.type === 'RO_INFO') {
      currentRO = message.roInfo;
      updateRODisplay();
      // Also update Search tab vehicle fields from RO
      if (currentRO && currentRO.vehicle) {
        document.getElementById('searchYear').value = currentRO.vehicle.year || '';
        document.getElementById('searchMake').value = currentRO.vehicle.make || '';
        document.getElementById('searchModel').value = currentRO.vehicle.model || '';
      }
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
          // Update Incoming Caller tab vehicle fields
          document.getElementById('vehicleYear').value = response.vehicleInfo.year || '';
          document.getElementById('vehicleMake').value = response.vehicleInfo.make || '';
          document.getElementById('vehicleModel').value = response.vehicleInfo.model || '';
          // Also update Search tab vehicle fields
          document.getElementById('searchYear').value = response.vehicleInfo.year || '';
          document.getElementById('searchMake').value = response.vehicleInfo.make || '';
          document.getElementById('searchModel').value = response.vehicleInfo.model || '';
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
          // Also update Search tab vehicle fields from RO
          if (currentRO && currentRO.vehicle) {
            document.getElementById('searchYear').value = currentRO.vehicle.year || '';
            document.getElementById('searchMake').value = currentRO.vehicle.make || '';
            document.getElementById('searchModel').value = currentRO.vehicle.model || '';
          }
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
  
  // Open full app button
  document.getElementById('openAppBtn').addEventListener('click', () => {
    // Use the global appUrl that was loaded from settings, or fallback
    if (appUrl) {
      chrome.tabs.create({ url: appUrl });
    } else {
      // Try to get from storage as fallback
      chrome.storage.sync.get(['heartHelperUrl'], (syncData) => {
        if (syncData.heartHelperUrl) {
          chrome.tabs.create({ url: syncData.heartHelperUrl });
        } else {
          chrome.storage.local.get(['appUrl'], (localData) => {
            const url = localData.appUrl || 'https://heart-helper.replit.app';
            chrome.tabs.create({ url: url });
          });
        }
      });
    }
  });
  
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  
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
  document.getElementById('ratesTab').style.display = tab === 'rates' ? 'flex' : 'none';
  
  // Auto-fill vehicle info when switching to search tab
  if (tab === 'search') {
    autoFillSearchVehicle();
  }
  
  // Load labor rate groups when switching to rates tab
  if (tab === 'rates') {
    loadLaborRateGroups();
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
    <button class="remove-symptom-btn">×</button>
  `;
  list.appendChild(row);
  
  // Add event listener (CSP doesn't allow inline onclick)
  row.querySelector('.remove-symptom-btn').addEventListener('click', function() {
    this.parentElement.remove();
  });
  
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
    const response = await authenticatedFetch(`${appUrl}/api/concerns/generate-questions`, {
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
    const response = await authenticatedFetch(`${appUrl}/api/concerns/clean-conversation`, {
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
  if (!cleanedConversation) {
    showToast('No conversation to send');
    return;
  }
  
  // Send cleaned conversation to content script to paste into Tekmetric
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('tekmetric.com')) {
      console.log('Sending to Tekmetric tab:', tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: 'PASTE_CONCERN', 
        text: cleanedConversation 
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Error sending to Tekmetric:', chrome.runtime.lastError);
          navigator.clipboard.writeText(cleanedConversation);
          showToast('Could not insert - copied to clipboard instead');
          return;
        }
        
        if (response && response.success) {
          showToast('Added to Tekmetric!');
        } else {
          // Field not found - copy to clipboard as fallback
          navigator.clipboard.writeText(cleanedConversation);
          showToast(response?.error || 'Open concern dialog in Tekmetric first. Copied to clipboard.');
        }
      });
    } else {
      // Not on Tekmetric - copy to clipboard
      navigator.clipboard.writeText(cleanedConversation);
      showToast('Copied! Open Tekmetric to paste.');
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
    const response = await authenticatedFetch(`${appUrl}/api/sales/generate-script`, {
      method: 'POST',
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
    
    const response = await authenticatedFetch(`${appUrl}/api/scripts/feedback`, {
      method: 'POST',
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
  ALL: 'All Locations',
  NB: 'Northbrook',
  WM: 'Wilmette',
  EV: 'Evanston'
};

function autoFillSearchVehicle() {
  const searchYear = document.getElementById('searchYear');
  const searchMake = document.getElementById('searchMake');
  const searchModel = document.getElementById('searchModel');
  
  // First try to fill from current RO vehicle info
  if (currentRO && currentRO.vehicle) {
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
  
  // Fallback: try to fill from Incoming Caller tab vehicle fields
  const incomingYear = document.getElementById('vehicleYear').value;
  const incomingMake = document.getElementById('vehicleMake').value;
  const incomingModel = document.getElementById('vehicleModel').value;
  
  if (!searchYear.value && incomingYear) {
    searchYear.value = incomingYear;
  }
  if (!searchMake.value && incomingMake) {
    searchMake.value = incomingMake;
  }
  if (!searchModel.value && incomingModel) {
    searchModel.value = incomingModel;
  }
}

async function performSearch() {
  const repairType = document.getElementById('searchRepairType').value.trim();
  
  if (!repairType) {
    showToast('Please enter a repair type');
    return;
  }
  
  if (!appUrl) {
    console.error('Search error: appUrl not configured');
    showToast('Please configure app URL in settings (gear icon)');
    openSettings();
    return;
  }
  
  const loadingOverlay = document.getElementById('searchLoadingOverlay');
  loadingOverlay.style.display = 'flex';
  
  try {
    const yearValue = document.getElementById('searchYear').value.trim();
    const params = {
      repairType: repairType,
      vehicleYear: yearValue ? parseInt(yearValue, 10) : undefined,
      vehicleMake: document.getElementById('searchMake').value.trim() || undefined,
      vehicleModel: document.getElementById('searchModel').value.trim() || undefined,
      vehicleEngine: document.getElementById('searchEngine').value.trim() || undefined,
      limit: 20
    };
    
    // Remove undefined values
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);
    
    console.log('Search params:', params);
    console.log('Fetching from:', `${appUrl}/api/search`);
    
    // Refresh cookie before searching
    await getSessionCookie();
    
    const response = await authenticatedFetch(`${appUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    
    console.log('Search response status:', response.status);
    
    if (!response.ok) {
      if (response.status === 401) {
        showToast('Please sign in to search');
        return;
      }
      if (response.status === 403) {
        showToast('Account pending approval');
        return;
      }
      const errorText = await response.text();
      console.error('Search error response:', errorText);
      throw new Error(`Search failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Search results:', data);
    searchResults = data.results || [];
    displaySearchResults();
    
    if (searchResults.length === 0) {
      showToast('No matching jobs found');
    }
    
  } catch (error) {
    console.error('Search error:', error);
    showToast('Search failed. Check connection.');
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
          ${job.serviceWriterName ? `<div class="job-card-meta-item"><span class="job-card-meta-icon">&#128100;</span>${job.serviceWriterName}</div>` : ''}
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
  
  // RO info with service advisor
  html += `
    <div class="job-detail-ro">
      RO #${job.repairOrderId}
      ${shopName ? `<span class="job-detail-shop">${shopName}</span>` : ''}
      ${job.serviceWriterName ? `<span class="job-detail-advisor">&#128100; ${job.serviceWriterName}</span>` : ''}
    </div>
  `;
  
  // Create Job in Tekmetric button
  html += `
    <div class="job-detail-actions">
      <button class="create-job-btn" id="createJobBtn" data-testid="button-create-job">
        <span class="btn-icon">&#128203;</span>
        Create Job in Tekmetric
      </button>
    </div>
  `;
  
  detailContent.innerHTML = html;
  
  // Add event listener (CSP doesn't allow inline onclick)
  document.getElementById('createJobBtn').addEventListener('click', createJobInTekmetric);
}

// Create job in Tekmetric from selected job result
// Uses direct API call for speed (1-2 seconds vs 20-30 seconds with UI automation)
async function createJobInTekmetric() {
  console.log('createJobInTekmetric called, selectedJobResult:', selectedJobResult);
  
  if (!selectedJobResult) {
    showToast('No job selected', 'error');
    return;
  }
  
  const job = selectedJobResult.job;
  const vehicle = selectedJobResult.vehicle;
  console.log('Creating job data for:', job.name);
  
  // Build job data for API
  // Note: API returns values in cents, we convert to dollars for the API payload
  const jobData = {
    jobName: job.name,
    name: job.name,
    vehicle: vehicle ? {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      engine: vehicle.engine,
      vin: vehicle.vin,
    } : null,
    laborItems: job.laborItems.map(item => ({
      name: item.name,
      description: item.name,
      hours: Number(item.hours),
      rate: (item.rate || 0) / 100,  // Convert cents to dollars
    })),
    parts: job.parts.map(part => ({
      name: part.name,
      description: part.name,
      brand: part.brand,
      partNumber: part.partNumber,
      quantity: part.quantity,
      cost: (part.cost || 0) / 100,  // Convert cents to dollars
      retail: (part.retail || part.unitPrice || 0) / 100,  // Convert cents to dollars
      price: (part.retail || part.unitPrice || 0) / 100,
    })),
    totals: {
      labor: (job.laborTotal || 0) / 100,
      parts: (job.partsTotal || 0) / 100,
      total: (job.subtotal || job.totalPrice || 0) / 100,
    },
  };
  
  console.log('Job data prepared for API:', jobData);
  
  try {
    // Check if we're on a Tekmetric page first
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Current tab:', tab?.url);
    
    if (!tab?.url?.includes('tekmetric.com')) {
      showToast('Navigate to a Tekmetric repair order first', 'error');
      return;
    }
    
    // Extract shop ID and RO ID from the URL
    // Patterns: /shop/469/repair-orders/277382151 or /sandbox/469/repair-orders/277382151
    const urlMatch = tab.url.match(/\/(?:shop|sandbox|cba)\/(\d+)\/repair-orders\/(\d+)/);
    
    if (!urlMatch) {
      showToast('Please open a repair order in Tekmetric first', 'error');
      return;
    }
    
    const shopId = urlMatch[1];
    const roId = urlMatch[2];
    
    console.log('Extracted from URL - Shop ID:', shopId, 'RO ID:', roId);
    
    // Show loading state
    const createBtn = document.getElementById('createJobBtn');
    const originalText = createBtn.innerHTML;
    createBtn.innerHTML = '<span class="btn-icon">&#9203;</span> Creating...';
    createBtn.disabled = true;
    
    // Call the API-based job creation
    console.log('Sending CREATE_JOB_VIA_API to background...');
    chrome.runtime.sendMessage({ 
      action: 'CREATE_JOB_VIA_API',
      shopId,
      roId,
      jobData 
    }, (response) => {
      console.log('CREATE_JOB_VIA_API response:', response);
      
      // Restore button state
      createBtn.innerHTML = originalText;
      createBtn.disabled = false;
      
      if (response?.success) {
        const laborCount = response.laborCount || 0;
        const partsCount = response.partsCount || 0;
        showToast(`Job created! (${laborCount} labor, ${partsCount} parts)`, 'success');
        
        // Refresh the Tekmetric tab to show the new job
        chrome.tabs.reload(tab.id);
      } else {
        const errorMsg = response?.error || 'Unknown error';
        console.error('Job creation failed:', errorMsg);
        showToast(`Failed: ${errorMsg}`, 'error');
      }
    });
  } catch (error) {
    console.error('Error creating job:', error);
    showToast('Failed to create job', 'error');
  }
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
  let newUrl = document.getElementById('appUrlInput').value.trim();
  
  if (newUrl) {
    try {
      // Normalize URL: extract just the origin (protocol + host)
      const parsed = new URL(newUrl);
      newUrl = parsed.origin; // This strips any path like /settings
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

// ==================== LABOR RATE GROUPS ====================

// Get current Tekmetric shop ID from background or storage
async function getCurrentTekmetricShopId() {
  // Try to get from storage (set by background.js)
  const data = await chrome.storage.local.get(['currentTekmetricShopId']);
  return data.currentTekmetricShopId || null;
}

async function loadLaborRateGroups() {
  const container = document.getElementById("laborRateGroupsList");
  const shopLabel = document.getElementById("ratesShopLabel");
  const adminLink = document.getElementById("ratesAdminLink");
  const openAdminLink = document.getElementById("openLaborRatesAdmin");
  
  if (!container) return;
  
  // Show loading state
  container.innerHTML = '<div class="no-groups-message">Loading labor rate groups...</div>';
  
  if (!appUrl) {
    shopLabel.textContent = 'App not connected';
    container.innerHTML = `
      <div class="no-groups-message">
        Connect to the HEART Helper app to view labor rate groups.
        Click the gear icon below to configure.
      </div>
    `;
    return;
  }
  
  // Get current shop ID
  const shopId = await getCurrentTekmetricShopId();
  
  try {
    // Fetch groups from server (includes both shop-specific and ALL location groups)
    const response = await authenticatedFetch(`${appUrl}/api/labor-rate-groups${shopId ? `?shopId=${shopId}` : ''}`);
    
    if (!response.ok) {
      if (response.status === 401) {
        shopLabel.textContent = 'Not signed in';
        container.innerHTML = `
          <div class="no-groups-message">
            Sign in to the HEART Helper app to view labor rate groups.
          </div>
        `;
        return;
      }
      throw new Error(`Server error: ${response.status}`);
    }
    
    const groups = await response.json();
    
    // Update shop label
    if (shopId && SHOP_NAMES[shopId]) {
      shopLabel.textContent = `Showing rates for: ${SHOP_NAMES[shopId]}`;
    } else if (shopId) {
      shopLabel.textContent = `Shop: ${shopId}`;
    } else {
      shopLabel.textContent = 'All configured rates';
    }
    
    // Show admin link for admin users
    if (currentUser?.isAdmin) {
      adminLink.style.display = 'block';
      openAdminLink.onclick = (e) => {
        e.preventDefault();
        window.open(`${appUrl}/admin/labor-rates`, '_blank');
      };
    } else {
      adminLink.style.display = 'none';
    }
    
    // Store groups locally for background.js to use
    await chrome.storage.local.set({ laborRateGroups: groups });
    
    if (groups.length === 0) {
      container.innerHTML = `
        <div class="no-groups-message">
          No labor rate groups configured for this location.
          ${currentUser?.isAdmin ? '<br><br>Click "Manage Labor Rates" below to add groups.' : '<br><br>Ask your admin to configure labor rate groups.'}
        </div>
      `;
      return;
    }
    
    // Group by shop for display
    const groupsByShop = {};
    groups.forEach(group => {
      const key = group.shopId || 'ALL';
      if (!groupsByShop[key]) groupsByShop[key] = [];
      groupsByShop[key].push(group);
    });
    
    // Render groups
    let html = '';
    
    // Show ALL location groups first if any
    if (groupsByShop['ALL']) {
      html += `<div class="shop-group-section">
        <div class="shop-group-label">All Locations</div>
        ${renderGroups(groupsByShop['ALL'])}
      </div>`;
    }
    
    // Show shop-specific groups
    Object.entries(groupsByShop)
      .filter(([key]) => key !== 'ALL')
      .forEach(([shopKey, shopGroups]) => {
        html += `<div class="shop-group-section">
          <div class="shop-group-label">${SHOP_NAMES[shopKey] || shopKey}</div>
          ${renderGroups(shopGroups)}
        </div>`;
      });
    
    container.innerHTML = html;
    
  } catch (error) {
    console.error('Error loading labor rate groups:', error);
    shopLabel.textContent = 'Error loading groups';
    container.innerHTML = `
      <div class="no-groups-message error">
        Failed to load labor rate groups. Check your connection and try again.
      </div>
    `;
  }
}

function renderGroups(groups) {
  return groups.map(group => `
    <div class="labor-rate-group-card">
      <div class="labor-rate-group-header">
        <span class="labor-rate-group-name">${escapeHtml(group.name)}</span>
        <span class="labor-rate-group-rate">$${(group.laborRate / 100).toFixed(2)}/hr</span>
      </div>
      <div class="labor-rate-group-makes">
        <strong>Makes:</strong> ${group.makes.map(m => escapeHtml(m)).join(", ")}
      </div>
    </div>
  `).join("");
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
