// State Management
let state = {
    releases: [],
    filteredReleases: [],
    searchQuery: '',
    activeFilter: 'all',
    sortBy: 'newest',
    theme: 'dark'
};

// DOM Elements
const elements = {
    themeToggle: document.getElementById('theme-toggle'),
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.querySelector('.refresh-icon'),
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statIssues: document.getElementById('stat-issues'),
    statSynced: document.getElementById('stat-synced'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    sortSelect: document.getElementById('sort-select'),
    filterChipsContainer: document.getElementById('filter-chips-container'),
    releasesGrid: document.getElementById('releases-grid'),
    emptyState: document.getElementById('empty-state'),
    clearFiltersBtn: document.getElementById('clear-filters-btn'),
    
    // Tweet Modal Elements
    tweetModal: document.getElementById('tweet-modal'),
    modalClose: document.getElementById('modal-close'),
    tweetPreviewDate: document.getElementById('tweet-preview-date'),
    tweetPreviewTag: document.getElementById('tweet-preview-tag'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    tweetShortenBtn: document.getElementById('tweet-shorten-btn'),
    charCount: document.getElementById('char-count'),
    tweetCopyBtn: document.getElementById('tweet-copy-btn'),
    tweetShareBtn: document.getElementById('tweet-share-btn'),
    toastContainer: document.getElementById('toast-container')
};

// Current active tweet note info
let activeTweetNote = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupEventListeners();
    fetchReleases();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);
}

function setTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

function setupEventListeners() {
    // Theme toggle
    elements.themeToggle.addEventListener('click', () => {
        const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        showToast(`Switched to ${nextTheme} mode`, 'info');
    });

    // Refresh button
    elements.refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search input
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        elements.searchClear.style.display = state.searchQuery ? 'block' : 'none';
        applyFilters();
    });

    // Clear search
    elements.searchClear.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        elements.searchClear.style.display = 'none';
        applyFilters();
        elements.searchInput.focus();
    });

    // Sort select
    elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        applyFilters();
    });

    // Empty state clear button
    elements.clearFiltersBtn.addEventListener('click', resetFilters);

    // Modal Close
    elements.modalClose.addEventListener('click', closeTweetModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeTweetModal();
    });

    // Character counter
    elements.tweetTextarea.addEventListener('input', updateCharCount);

    // Smart Truncate button
    elements.tweetShortenBtn.addEventListener('click', handleSmartTruncate);

    // Copy tweet button
    elements.tweetCopyBtn.addEventListener('click', copyTweetText);

    // Share tweet button
    elements.tweetShareBtn.addEventListener('click', shareOnTwitter);
}

// Reset Filters
function resetFilters() {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.searchClear.style.display = 'none';
    state.activeFilter = 'all';
    
    // Reset active chip
    const chips = elements.filterChipsContainer.querySelectorAll('.chip');
    chips.forEach(chip => {
        if (chip.getAttribute('data-filter') === 'all') {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });

    state.sortBy = 'newest';
    elements.sortSelect.value = 'newest';
    
    applyFilters();
    showToast('Filters cleared', 'info');
}

// Fetch Releases from API
async function fetchReleases(forceRefresh = false) {
    showLoading();
    elements.refreshIcon.classList.add('spin');
    elements.refreshBtn.disabled = true;

    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'success' || data.status === 'partial_success') {
            state.releases = data.releases;
            
            // Format check-in stats
            updateStats(data);
            
            // Create dynamic filters
            generateFilterChips();
            
            // Render
            applyFilters();
            
            if (forceRefresh) {
                if (data.source === 'network') {
                    showToast('Successfully fetched latest release notes', 'success');
                } else if (data.source === 'cache_fallback') {
                    showToast('Network error, showing cached notes: ' + data.error, 'warning');
                }
            }
        } else {
            throw new Error(data.error || 'Failed to fetch releases');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showToast(error.message || 'Error loading release notes. Please try again.', 'error');
        renderEmptyState('Connection Error', 'Could not load release notes. Please check the backend console or retry.');
    } finally {
        elements.refreshIcon.classList.remove('spin');
        elements.refreshBtn.disabled = false;
    }
}

// Update Dashboard Statistics
function updateStats(data) {
    const total = data.releases.length;
    const features = data.releases.filter(r => r.type.toLowerCase() === 'feature').length;
    const issues = data.releases.filter(r => 
        r.type.toLowerCase() === 'issue' || 
        r.type.toLowerCase() === 'known issue' ||
        r.type.toLowerCase() === 'fixed' ||
        r.type.toLowerCase() === 'resolved'
    ).length;

    elements.statTotal.textContent = total;
    elements.statFeatures.textContent = features;
    elements.statIssues.textContent = issues;
    
    // Parse time if available
    if (data.fetched_at) {
        const timeParts = data.fetched_at.split(' ');
        elements.statSynced.textContent = timeParts.length > 1 ? timeParts[1] : data.fetched_at;
    } else {
        elements.statSynced.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

// Generate Filter Chips Dynamically
function generateFilterChips() {
    // Extract unique tags and count them
    const typeCounts = {};
    state.releases.forEach(r => {
        typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    });

    // Clear existing chips except "All"
    const allChip = elements.filterChipsContainer.querySelector('[data-filter="all"]');
    elements.filterChipsContainer.innerHTML = '';
    
    // Add "All Updates"
    allChip.textContent = `All Updates (${state.releases.length})`;
    elements.filterChipsContainer.appendChild(allChip);

    // Sort types alphabetically
    const sortedTypes = Object.keys(typeCounts).sort();

    // Create a chip for each type
    sortedTypes.forEach(type => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        if (state.activeFilter === type) {
            chip.classList.add('active');
        }
        chip.setAttribute('data-filter', type);
        chip.textContent = `${type} (${typeCounts[type]})`;
        
        chip.addEventListener('click', () => {
            // Update active state in UI
            elements.filterChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            state.activeFilter = type;
            applyFilters();
        });
        
        elements.filterChipsContainer.appendChild(chip);
    });

    // Make sure click listener remains on allChip
    allChip.onclick = () => {
        elements.filterChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        allChip.classList.add('active');
        state.activeFilter = 'all';
        applyFilters();
    };
}

// Filter and Sort Engine
function applyFilters() {
    let result = [...state.releases];

    // 1. Tag Filter
    if (state.activeFilter !== 'all') {
        result = result.filter(r => r.type === state.activeFilter);
    }

    // 2. Search Query Filter
    if (state.searchQuery) {
        result = result.filter(r => {
            const matchesText = r.text.toLowerCase().includes(state.searchQuery);
            const matchesDate = r.date.toLowerCase().includes(state.searchQuery);
            const matchesType = r.type.toLowerCase().includes(state.searchQuery);
            return matchesText || matchesDate || matchesType;
        });
    }

    // 3. Sorting
    result.sort((a, b) => {
        const dateA = new Date(a.isoDate || 0);
        const dateB = new Date(b.isoDate || 0);
        return state.sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    state.filteredReleases = result;
    renderReleases();
}

// Render Release Note Cards
function renderReleases() {
    elements.releasesGrid.innerHTML = '';
    
    if (state.filteredReleases.length === 0) {
        elements.releasesGrid.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        return;
    }

    elements.releasesGrid.style.display = 'grid';
    elements.emptyState.style.display = 'none';

    state.filteredReleases.forEach((note, index) => {
        const card = document.createElement('article');
        card.className = 'release-card animate-fade-in';
        // Staggered load animation using inline style delays
        card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
        
        // Match tag color class name
        const tagClass = `tag-${note.type.toLowerCase().replace(/\s+/g, '-')}`;
        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-date">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>${note.date}</span>
                </span>
                <span class="tag ${tagClass}">${note.type}</span>
            </div>
            
            <div class="card-body">
                ${note.html}
            </div>
            
            <div class="card-footer">
                ${note.link ? `
                    <a href="${note.link}" target="_blank" rel="noopener noreferrer" class="card-link">
                        <span>Official Docs</span>
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                ` : '<span></span>'}
                
                <button class="btn btn-primary btn-tweet-trigger" data-id="${note.id}">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span>Tweet</span>
                </button>
            </div>
        `;
        
        // Add event listener to Tweet button
        card.querySelector('.btn-tweet-trigger').addEventListener('click', () => {
            openTweetModal(note);
        });

        // Ensure links in card body open in a new tab
        card.querySelectorAll('.card-body a').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });

        elements.releasesGrid.appendChild(card);
    });
}

// Show skeleton screen during loader state
function showLoading() {
    elements.releasesGrid.style.display = 'grid';
    elements.emptyState.style.display = 'none';
    elements.releasesGrid.innerHTML = `
        <div class="skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-shimmer skeleton-title"></div>
                <div class="skeleton-shimmer skeleton-tag"></div>
            </div>
            <div class="skeleton-shimmer skeleton-body-line"></div>
            <div class="skeleton-shimmer skeleton-body-line" style="width: 85%;"></div>
            <div class="skeleton-shimmer skeleton-body-line" style="width: 60%;"></div>
            <div class="skeleton-footer">
                <div class="skeleton-shimmer skeleton-btn"></div>
            </div>
        </div>
        <div class="skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-shimmer skeleton-title"></div>
                <div class="skeleton-shimmer skeleton-tag"></div>
            </div>
            <div class="skeleton-shimmer skeleton-body-line"></div>
            <div class="skeleton-shimmer skeleton-body-line" style="width: 90%;"></div>
            <div class="skeleton-shimmer skeleton-body-line" style="width: 40%;"></div>
            <div class="skeleton-footer">
                <div class="skeleton-shimmer skeleton-btn"></div>
            </div>
        </div>
        <div class="skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-shimmer skeleton-title"></div>
                <div class="skeleton-shimmer skeleton-tag"></div>
            </div>
            <div class="skeleton-shimmer skeleton-body-line"></div>
            <div class="skeleton-shimmer skeleton-body-line" style="width: 80%;"></div>
            <div class="skeleton-shimmer skeleton-body-line" style="width: 70%;"></div>
            <div class="skeleton-footer">
                <div class="skeleton-shimmer skeleton-btn"></div>
            </div>
        </div>
    `;
}

function renderEmptyState(title, description) {
    elements.releasesGrid.style.display = 'none';
    elements.emptyState.style.display = 'flex';
    elements.emptyState.querySelector('h3').textContent = title;
    elements.emptyState.querySelector('p').textContent = description;
}

// Tweet Composer Modal Logic
function openTweetModal(note) {
    activeTweetNote = note;
    
    // Set headers
    elements.tweetPreviewDate.textContent = note.date;
    elements.tweetPreviewTag.textContent = note.type;
    
    // Clear tag classes
    elements.tweetPreviewTag.className = 'tag';
    const tagClass = `tag-${note.type.toLowerCase().replace(/\s+/g, '-')}`;
    elements.tweetPreviewTag.classList.add(tagClass);

    // Compose Tweet Content
    const defaultText = generateTweetText(note, false);
    elements.tweetTextarea.value = defaultText;
    
    // Open modal
    elements.tweetModal.style.display = 'flex';
    setTimeout(() => {
        elements.tweetModal.classList.add('active');
    }, 10);
    
    // Focus textarea
    elements.tweetTextarea.focus();
    updateCharCount();
}

function closeTweetModal() {
    elements.tweetModal.classList.remove('active');
    setTimeout(() => {
        elements.tweetModal.style.display = 'none';
    }, 300);
    activeTweetNote = null;
    
    // Reset copy button icon
    resetCopyButtonState();
}

function generateTweetText(note, truncate = false) {
    const header = `🚀 BigQuery [${note.type}] (${note.date}):\n`;
    const footer = note.link ? `\n\nDocs: ${note.link}\n#BigQuery #GoogleCloud` : `\n\n#BigQuery #GoogleCloud`;
    
    let description = note.text;
    
    if (truncate) {
        // Calculate max allowed length for description
        // Standard Twitter limit is 280
        const currentMetadataLength = header.length + footer.length;
        const maxDescriptionLength = 280 - currentMetadataLength;
        
        if (description.length > maxDescriptionLength) {
            description = description.substring(0, maxDescriptionLength - 3) + '...';
        }
    }
    
    return `${header}${description}${footer}`;
}

function updateCharCount() {
    const text = elements.tweetTextarea.value;
    const length = text.length;
    elements.charCount.textContent = length;
    
    elements.charCount.className = '';
    if (length > 280) {
        elements.charCount.classList.add('char-count-excess');
    } else if (length > 250) {
        elements.charCount.classList.add('char-count-warning');
    }
}

function handleSmartTruncate() {
    if (!activeTweetNote) return;
    
    const truncatedText = generateTweetText(activeTweetNote, true);
    elements.tweetTextarea.value = truncatedText;
    updateCharCount();
    showToast('Tweet content fitted to 280 characters', 'info');
}

async function copyTweetText() {
    const text = elements.tweetTextarea.value;
    try {
        await navigator.clipboard.writeText(text);
        
        // Show success icon
        const copyIcon = elements.tweetCopyBtn.querySelector('.copy-icon');
        const checkIcon = elements.tweetCopyBtn.querySelector('.check-icon');
        const textSpan = elements.tweetCopyBtn.querySelector('span');
        
        copyIcon.style.display = 'none';
        checkIcon.style.display = 'inline-block';
        textSpan.textContent = 'Copied!';
        
        showToast('Copied to clipboard!', 'success');
        
        // Revert after 2 seconds
        setTimeout(resetCopyButtonState, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy text', 'error');
    }
}

function resetCopyButtonState() {
    const copyIcon = elements.tweetCopyBtn.querySelector('.copy-icon');
    const checkIcon = elements.tweetCopyBtn.querySelector('.check-icon');
    const textSpan = elements.tweetCopyBtn.querySelector('span');
    
    if (copyIcon && checkIcon && textSpan) {
        copyIcon.style.display = 'inline-block';
        checkIcon.style.display = 'none';
        textSpan.textContent = 'Copy Text';
    }
}

function shareOnTwitter() {
    const text = elements.tweetTextarea.value;
    
    if (text.length > 280) {
        if (!confirm('Your tweet exceeds 280 characters and will be truncated by Twitter. Do you want to post it anyway? (You can use "Smart Truncate" to fix this)')) {
            return;
        }
    }
    
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'width=550,height=420');
}

// Toast Notifications System
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast animate-fade-in`;
    
    let icon = '';
    if (type === 'success') {
        icon = `<svg class="toast-success-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
        icon = `<svg class="toast-error-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (type === 'warning') {
        icon = `<svg class="toast-error-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" style="color: #f59e0b;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
        icon = `<svg class="toast-info-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }
    
    toast.innerHTML = `
        ${icon}
        <span>${message}</span>
    `;
    
    elements.toastContainer.appendChild(toast);
    
    // Animate active
    setTimeout(() => {
        toast.classList.add('active');
    }, 10);
    
    // Remove after 3.5 seconds
    setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}
