// Global State
let releaseNotes = [];
let activeFilter = 'all';
let searchQuery = '';

// DOM Elements
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const filterBtns = document.querySelectorAll('.filter-btn');
const notesGrid = document.getElementById('notes-grid');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const retryBtn = document.getElementById('retry-btn');
const connectionStatus = document.getElementById('connection-status');
const toast = document.getElementById('toast');

// Modal Elements
const tweetModal = document.getElementById('tweet-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const charProgressCircle = document.getElementById('char-progress-circle');
const copyTweetBtn = document.getElementById('copy-tweet-btn');
const postTweetBtn = document.getElementById('post-tweet-btn');
const tweetPreviewType = document.getElementById('tweet-preview-type');
const tweetPreviewDate = document.getElementById('tweet-preview-date');
const tweetPreviewDesc = document.getElementById('tweet-preview-desc');

// SVG constants for badges
const BADGE_MAP = {
    'Feature': 'badge-feature',
    'Issue': 'badge-issue',
    'Deprecation': 'badge-deprecation'
};

// SVG Icon templates
const ICONS = {
    externalLink: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
    twitter: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>`
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    fetchReleaseNotes();
    setupEventListeners();
});

// Event Listeners Setup
function setupEventListeners() {
    // Refresh & Retry Buttons
    refreshBtn.addEventListener('click', fetchReleaseNotes);
    retryBtn.addEventListener('click', fetchReleaseNotes);

    // Search Input
    searchInput.addEventListener('input', handleSearchInput);
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearSearchBtn.style.display = 'none';
        applyFiltersAndSearch();
    });

    // Filter Buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeFilter = e.currentTarget.dataset.filter;
            applyFiltersAndSearch();
        });
    });

    // Modal Events
    closeModalBtn.addEventListener('click', closeTweetModal);
    tweetModal.addEventListener('click', (e) => {
        if (e.target === tweetModal) closeTweetModal();
    });

    // Textarea character count and circle progress updates
    tweetTextarea.addEventListener('input', updateTweetCharCount);

    // Clipboard Copy
    copyTweetBtn.addEventListener('click', copyTweetToClipboard);

    // Post to Twitter/X
    postTweetBtn.addEventListener('click', postTweetToX);
}

// Fetch notes from Flask API
async function fetchReleaseNotes() {
    // Show loading state, hide others
    loadingState.style.display = 'flex';
    notesGrid.style.display = 'none';
    errorState.style.display = 'none';
    emptyState.style.display = 'none';
    
    // Add spinning animation to button icon
    const refreshIcon = refreshBtn.querySelector('.spinner-icon');
    refreshIcon.classList.add('spinning');
    refreshBtn.disabled = true;
    
    connectionStatus.className = 'status-indicator loading';
    connectionStatus.querySelector('.status-label').textContent = 'Syncing...';

    try {
        const response = await fetch('/api/release-notes');
        const data = await response.json();

        if (data.status === 'success') {
            releaseNotes = data.updates;
            applyFiltersAndSearch();
            
            connectionStatus.className = 'status-indicator online';
            connectionStatus.querySelector('.status-label').textContent = 'Synced';
        } else {
            showError(data.message || 'Failed to fetch release notes from API.');
        }
    } catch (err) {
        showError('Network error: Could not reach Flask server.');
        console.error(err);
    } finally {
        refreshIcon.classList.remove('spinning');
        refreshBtn.disabled = false;
    }
}

// Show error state
function showError(msg) {
    loadingState.style.display = 'none';
    notesGrid.style.display = 'none';
    emptyState.style.display = 'none';
    errorState.style.display = 'flex';
    errorMessage.textContent = msg;
    
    connectionStatus.className = 'status-indicator offline';
    connectionStatus.querySelector('.status-label').textContent = 'Offline';
}

// Search Input Handler
function handleSearchInput(e) {
    searchQuery = e.target.value.toLowerCase().trim();
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    applyFiltersAndSearch();
}

// Filtering and Searching Logic
function applyFiltersAndSearch() {
    let filtered = releaseNotes;

    // Apply Filter Tab
    if (activeFilter !== 'all') {
        if (activeFilter === 'other') {
            filtered = filtered.filter(note => note.type !== 'Feature' && note.type !== 'Issue' && note.type !== 'Deprecation');
        } else {
            filtered = filtered.filter(note => note.type === activeFilter);
        }
    }

    // Apply Search Query
    if (searchQuery) {
        filtered = filtered.filter(note => {
            const dateMatch = note.date.toLowerCase().includes(searchQuery);
            const typeMatch = note.type.toLowerCase().includes(searchQuery);
            const contentMatch = note.plain_text.toLowerCase().includes(searchQuery);
            return dateMatch || typeMatch || contentMatch;
        });
    }

    renderNotes(filtered);
}

// Render release note cards
function renderNotes(notes) {
    loadingState.style.display = 'none';
    
    if (notes.length === 0) {
        notesGrid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    notesGrid.innerHTML = '';
    
    notes.forEach(note => {
        const card = document.createElement('article');
        card.className = 'note-card';
        card.setAttribute('data-id', note.id);
        
        // Determine badge type class
        const badgeClass = BADGE_MAP[note.type] || 'badge-other';
        
        card.innerHTML = `
            <div class="note-card-header">
                <div class="note-card-meta">
                    <span class="badge ${badgeClass}">${note.type}</span>
                    <span class="card-date">${note.date}</span>
                </div>
                <button class="tweet-shortcut-btn" title="Compose Tweet about this update" aria-label="Tweet this update">
                    ${ICONS.twitter}
                </button>
            </div>
            
            <div class="note-card-content">
                ${note.content_html}
            </div>
            
            <div class="note-card-footer">
                <a href="${note.url}" class="source-link" target="_blank" rel="noopener noreferrer">
                    <span>View Official Source</span>
                    ${ICONS.externalLink}
                </a>
                <button class="tweet-action-trigger" aria-label="Open Tweet Composer">
                    ${ICONS.twitter}
                    <span>Tweet This</span>
                </button>
            </div>
        `;
        
        // Bind events to tweet buttons
        const tweetBtn = card.querySelector('.tweet-shortcut-btn');
        const tweetTextTrigger = card.querySelector('.tweet-action-trigger');
        
        [tweetBtn, tweetTextTrigger].forEach(element => {
            element.addEventListener('click', () => openTweetModal(note));
        });
        
        notesGrid.appendChild(card);
    });

    notesGrid.style.display = 'grid';
}

// Open Tweet Modal
function openTweetModal(note) {
    // Set preview details
    const badgeClass = BADGE_MAP[note.type] || 'badge-other';
    tweetPreviewType.className = `badge ${badgeClass}`;
    tweetPreviewType.textContent = note.type;
    tweetPreviewDate.textContent = note.date;
    tweetPreviewDesc.textContent = note.plain_text;
    
    // Compose Default Tweet text
    // Example: BigQuery Release (June 15, 2026) - Feature: Use Gemini Cloud Assist to optimize query performance in BigQuery. #GoogleCloud #BigQuery https://docs.cloud.google.com/bigquery/docs/release-notes#June_15_2026
    let tweetPrefix = `BigQuery Release Note (${note.date}) -\n`;
    let hashTags = `\n#GoogleCloud #BigQuery`;
    let urlString = `\n${note.url}`;
    
    // Calculate space for description
    const fixedLength = tweetPrefix.length + hashTags.length + urlString.length;
    const maxDescLength = 280 - fixedLength - 4; // -4 for ellipsis or buffers
    
    let desc = note.plain_text;
    if (desc.length > maxDescLength) {
        desc = desc.substring(0, maxDescLength - 3) + '...';
    }
    
    tweetTextarea.value = `${tweetPrefix}${desc}${hashTags}${urlString}`;
    
    // Open modal
    tweetModal.style.display = 'flex';
    // Add open class in next frame for transition
    setTimeout(() => {
        tweetModal.classList.add('open');
        tweetTextarea.focus();
        updateTweetCharCount();
    }, 10);
}

// Close Tweet Modal
function closeTweetModal() {
    tweetModal.classList.remove('open');
    setTimeout(() => {
        tweetModal.style.display = 'none';
    }, 300);
}

// Update character count progress and styling
function updateTweetCharCount() {
    const text = tweetTextarea.value;
    const len = text.length;
    
    charCounter.textContent = `${len} / 280`;
    
    const wrapper = charCounter.parentElement;
    wrapper.classList.remove('warning', 'danger');
    postTweetBtn.disabled = false;
    
    if (len > 280) {
        wrapper.classList.add('danger');
        postTweetBtn.disabled = true;
        charProgressCircle.style.stroke = 'var(--color-issue)';
    } else if (len > 250) {
        wrapper.classList.add('warning');
        charProgressCircle.style.stroke = 'var(--color-deprecation)';
    } else {
        charProgressCircle.style.stroke = 'var(--color-twitter)';
    }
    
    // Update SVG Progress circle
    // Radius = 10, Circumference = 2 * PI * 10 = 62.8318
    const r = 10;
    const circ = 2 * Math.PI * r;
    
    charProgressCircle.style.strokeDasharray = `${circ} ${circ}`;
    
    // offset goes from circ (0%) to 0 (100%)
    const pct = Math.min(len, 280) / 280;
    const offset = circ - (pct * circ);
    
    charProgressCircle.style.strokeDashoffset = offset;
}

// Copy draft tweet text to Clipboard
async function copyTweetToClipboard() {
    const text = tweetTextarea.value;
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy text: ', err);
        // Fallback for older browsers
        tweetTextarea.select();
        document.execCommand('copy');
        showToast('Copied to clipboard!');
    }
}

// Post draft tweet on X (Twitter)
function postTweetToX() {
    const text = tweetTextarea.value;
    if (text.length > 280) return;
    
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
}

// Show popup Toast alert
function showToast(message) {
    toast.querySelector('span').textContent = message;
    toast.style.display = 'flex';
    
    // Trigger CSS slide-up in next frame
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Hide toast after 2.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.style.display = 'none';
        }, 300);
    }, 2500);
}
