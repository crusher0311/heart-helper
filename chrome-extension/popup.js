function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function displayJobInfo(jobData, elementId) {
  const element = document.getElementById(elementId);
  if (!element || !jobData) return;

  const vehicle = jobData.vehicle 
    ? `${jobData.vehicle.year} ${jobData.vehicle.make} ${jobData.vehicle.model}`
    : 'No vehicle info';

  element.innerHTML = `
    <div class="job-detail">
      <span class="job-detail-label">Job:</span>
      <span class="job-detail-value">${jobData.jobName}</span>
    </div>
    <div class="job-detail">
      <span class="job-detail-label">Vehicle:</span>
      <span class="job-detail-value">${vehicle}</span>
    </div>
    <div class="job-detail">
      <span class="job-detail-label">Labor Items:</span>
      <span class="job-detail-value">${jobData.laborItems?.length || 0}</span>
    </div>
    <div class="job-detail">
      <span class="job-detail-label">Parts:</span>
      <span class="job-detail-value">${jobData.parts?.length || 0}</span>
    </div>
    <div class="job-detail">
      <span class="job-detail-label">Total:</span>
      <span class="job-detail-value">${formatCurrency(jobData.totals?.total || 0)}</span>
    </div>
  `;
}

function updatePopup() {
  chrome.runtime.sendMessage({ action: "GET_PENDING_JOB" }, (pendingResponse) => {
    if (pendingResponse && pendingResponse.jobData) {
      document.getElementById('no-job').style.display = 'none';
      document.getElementById('job-ready').style.display = 'block';
      displayJobInfo(pendingResponse.jobData, 'job-info');
    } else {
      document.getElementById('no-job').style.display = 'block';
      document.getElementById('job-ready').style.display = 'none';
    }
  });

  chrome.runtime.sendMessage({ action: "GET_LAST_JOB" }, (lastResponse) => {
    if (lastResponse && lastResponse.jobData) {
      document.getElementById('last-job-section').style.display = 'block';
      const lastJobInfo = document.getElementById('last-job-info');
      
      const vehicle = lastResponse.jobData.vehicle
        ? `${lastResponse.jobData.vehicle.year} ${lastResponse.jobData.vehicle.make} ${lastResponse.jobData.vehicle.model}`
        : 'No vehicle info';
      
      lastJobInfo.innerHTML = `
        <div style="margin-bottom: 8px;">
          <strong>${lastResponse.jobData.jobName}</strong>
        </div>
        <div style="color: #6b7280; margin-bottom: 4px;">${vehicle}</div>
        <div style="color: #9ca3af; font-size: 11px;">
          ${formatDate(lastResponse.timestamp)}
        </div>
      `;
    }
  });
}

document.addEventListener('DOMContentLoaded', updatePopup);

setInterval(updatePopup, 2000);
