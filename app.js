// ==========================================================================
// Supplement Inventory System - Frontend Logic
// ==========================================================================

// Global state
let inventoryData = [];
let _nextId = 1; // Unique ID counter for each item
let filteredData = [];
let currentView = 'table'; // 'table' or 'grid'
let standaloneMode = false;
let saveTimeout = null;
let currentLightboxIndex = -1;
let imgRotation = 0;
let imgScale = 1;
let sortColumn = '';
let sortDirection = 'asc';
let initialLoad = true;
// Snapshot of the last successfully saved data (JSON string).
// Autosave is skipped if current data matches this snapshot.
let lastSavedSnapshot = null;


// Google Sheets Cloud sync URL (saved in localStorage or set here directly)
let googleScriptUrl = localStorage.getItem('google_script_url') || 'https://script.google.com/macros/s/AKfycbw5H-MlMtpzw04ahKptEXQR-sOAhAdPlnZCbFo9f6avefk3YUR_TYs5wHGSWGEINFcejA/exec';

// Hardcoded image list fallback for Standalone Mode (double-clicking index.html)
const DEFAULT_IMAGES = [
  "S__144195663_0.jpg",
  "S__144195664_0.jpg",
  "S__144195665_0.jpg",
  "S__144195666_0.jpg",
  "S__144195667.jpg",
  "S__144195668.jpg",
  "S__144195669.jpg",
  "S__144195670.jpg",
  "S__144195671.jpg",
  "S__144195672.jpg",
  "S__144195674_0.jpg",
  "S__144195675_0.jpg",
  "S__144195676_0.jpg",
  "S__144195677_0.jpg",
  "S__144195678_0.jpg",
  "S__144195679_0.jpg",
  "S__144195680_0.jpg",
  "S__144195681_0.jpg",
  "S__144195682_0.jpg",
  "S__144195683_0.jpg",
  "S__144195685_0.jpg",
  "S__144195686_0.jpg",
  "S__144195687_0.jpg"
];

// Elements
const tableBody = document.getElementById('tableBody');
const cardGrid = document.getElementById('cardGrid');
const tableViewEl = document.getElementById('tableView');
const gridViewEl = document.getElementById('gridView');
const emptyStateEl = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearch');
const viewTableBtn = document.getElementById('viewTableBtn');
const viewGridBtn = document.getElementById('viewGridBtn');
const themeToggleBtn = document.getElementById('themeToggle');
const saveStatusText = document.getElementById('saveStatusText');
const saveStatusIconSaved = document.querySelector('.saved-icon');
const saveStatusIconSaving = document.querySelector('.saving-icon');
const addItemBtn = document.getElementById('addItemBtn');

// Stats elements
const statTotalItems = document.getElementById('statTotalItems');
const statTotalBottles = document.getElementById('statTotalBottles');
const statNewCount = document.getElementById('statNewCount');
const statOpenedCount = document.getElementById('statOpenedCount');

// Lightbox elements
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxPrev = document.getElementById('lightboxPrev');
const lightboxNext = document.getElementById('lightboxNext');

// ==========================================================================
// Initialization & Loading
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
  setupEventListeners();
  initResizableColumns();
  
  // Initialize Lucide Icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
});

// Load theme settings from localStorage
function initTheme() {
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcons(currentTheme);
}

// Toggle Theme (Dark / Light)
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
  const darkIcon = document.querySelector('.dark-icon');
  const lightIcon = document.querySelector('.light-icon');
  if (theme === 'dark') {
    darkIcon.style.display = 'none';
    lightIcon.style.display = 'block';
  } else {
    darkIcon.style.display = 'block';
    lightIcon.style.display = 'none';
  }
}

// Fetch inventory data
async function loadData() {
  // Reset the guard so autosave is blocked during this load
  initialLoad = true;
  showLoading();
  
  // 1. Try to load from Google Sheets if configured
  if (googleScriptUrl) {
    try {
      console.log('Attempting to fetch from Google Sheets...');
      const response = await fetch(googleScriptUrl);
      const result = await response.json();
      
      if (result && Array.isArray(result)) {
        if (result.length === 0) {
          console.log('Google Sheets is empty. Starting with empty table.');
          inventoryData = [];
        } else {
          inventoryData = mapData(result);
          // Clear stale localStorage so it never conflicts with cloud data
          localStorage.removeItem('supplement_inventory_data');
        }
        standaloneMode = true;
        console.log('Successfully loaded data from Google Sheets. Count:', inventoryData.length);
        // Deduplicate rows that may have accumulated from previous bugs
        inventoryData = deduplicateData(inventoryData);
        console.log('After dedup count:', inventoryData.length);
        // Record snapshot: any data that looks exactly like this does NOT need re-saving
        lastSavedSnapshot = JSON.stringify(inventoryData.map(stripId));
        applyFilters();
        initialLoad = false;
        return;
      } else if (result && result.success && Array.isArray(result.data)) {
        if (result.data.length === 0) {
          console.log('Google Sheets is empty. Starting with empty table.');
          inventoryData = [];
        } else {
          inventoryData = mapData(result.data);
          // Clear stale localStorage so it never conflicts with cloud data
          localStorage.removeItem('supplement_inventory_data');
        }
        standaloneMode = true;
        console.log('Successfully loaded data from Google Sheets API. Count:', inventoryData.length);
        // Deduplicate rows that may have accumulated from previous bugs
        inventoryData = deduplicateData(inventoryData);
        console.log('After dedup count:', inventoryData.length);
        // Record snapshot so unchanged data is never re-saved
        lastSavedSnapshot = JSON.stringify(inventoryData.map(stripId));
        applyFilters();
        initialLoad = false;
        return;
      }
    } catch (err) {
      console.warn('Failed to load from Google Sheets. Falling back to local files...', err);
    }
  }

  // 2. Try to load from Local Python Server API
  try {
    const response = await fetch('/api/data');
    const result = await response.json();
    
    if (result.success && result.data && result.data.length > 0) {
      inventoryData = mapData(result.data);
      standaloneMode = false;
      console.log('Successfully connected to local server API.');
      applyFilters();
      initialLoad = false;
      return;
    } else {
      throw new Error('No data returned or server mode inactive');
    }
  } catch (error) {
    console.warn('Cannot fetch from local server API. Trying to load static data.json...', error);
  }
  
  // 3. Try to load static data.json file
  try {
    const staticResponse = await fetch('data.json');
    const staticData = await staticResponse.json();
    if (Array.isArray(staticData) && staticData.length > 0) {
      inventoryData = mapData(staticData);
      standaloneMode = true;
      console.log('Successfully loaded static data.json file.');
    } else {
      throw new Error('Static data.json is empty or invalid');
    }
  } catch (staticError) {
    // 4. Fall back to empty table
    console.warn('Cannot load static data.json either. Starting with empty table.', staticError);
    standaloneMode = true;
    inventoryData = [];
  }
  
  applyFilters();
  initialLoad = false;
}

// Map database fields to standard schema safely
// Each item gets a unique _id so that findIndex never mixes up items with the same image
function mapData(array) {
  return array.map(item => ({
    _id: item._id || (_nextId++),
    image: item.image || 'https://placehold.co/150?text=No+Image',
    name: item.name !== undefined ? item.name : (item.nameA || ''),
    spec: item.spec !== undefined ? item.spec : (item.specA || ''),
    totalBottles: item.totalBottles || '',
    newCount: item.newCount || '',
    openedCount: item.openedCount || '',
    remarks: item.remarks || ''
  }));
}

function loadDataFromLocalStorage() {
  // For safety we no longer read any cached data. If the cloud fails we start with an empty table.
  inventoryData = [];
}

// Remove duplicate rows coming from Google Sheets.
// Two rows are considered duplicates if they have the same name+spec+image.
function deduplicateData(arr) {
  const seen = new Set();
  return arr.filter(item => {
    // Build a key: for base64 images use first 100 chars (enough to distinguish)
    const imgKey = item.image && item.image.startsWith('data:')
      ? item.image.substring(0, 100)
      : (item.image || '');
    const key = `${item.name}||${item.spec}||${imgKey}`;
    if (seen.has(key)) {
      console.warn('Dedup: removed duplicate row:', item.name);
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Strip internal _id field before comparing or sending to server
function stripId(item) {
  const { _id, ...rest } = item;
  return rest;
}



function showLoading() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="8" class="td-loading">
        <div class="spinner-container">
          <i data-lucide="loader" class="spin"></i>
          <span>載入庫存資料中...</span>
        </div>
      </td>
    </tr>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================================================
// Rendering Views
// ==========================================================================
function render() {
  // Update Stats Counters
  updateStatistics();

  if (filteredData.length === 0) {
    tableBody.innerHTML = '';
    cardGrid.innerHTML = '';
    
    if (inventoryData.length === 0) {
      // No images at all
      tableViewEl.style.display = 'none';
      gridViewEl.style.display = 'none';
      emptyStateEl.style.display = 'flex';
    } else {
      // Images exist but search returns empty
      tableViewEl.style.display = currentView === 'table' ? 'block' : 'none';
      gridViewEl.style.display = currentView === 'grid' ? 'block' : 'none';
      emptyStateEl.style.display = 'none';
      
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-secondary);">沒有找到符合搜尋條件的保健食品</td></tr>`;
      cardGrid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-secondary);">沒有找到符合搜尋條件的保健食品</div>`;
    }
    return;
  }

  emptyStateEl.style.display = 'none';
  
  if (currentView === 'table') {
    tableViewEl.style.display = 'block';
    gridViewEl.style.display = 'none';
    renderTable();
  } else {
    tableViewEl.style.display = 'none';
    gridViewEl.style.display = 'block';
    renderGrid();
  }
}

// Render dynamic table rows
function renderTable() {
  tableBody.innerHTML = '';
  
  filteredData.forEach((item, idx) => {
    // Find original index in source array using unique _id to avoid image collision
    const originalIndex = inventoryData.findIndex(orig => orig._id === item._id);
    
    const tr = document.createElement('tr');
    
    // Set row to be draggable
    tr.draggable = true;
    
    tr.addEventListener('dragstart', (e) => {
      // If we are currently sorting, reset sorting before dragging
      if (sortColumn) {
        sortColumn = '';
        updateHeaderSortIcons();
      }
      tr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', originalIndex);
      window.draggedRowOriginalIndex = originalIndex;
    });
    
    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      return false;
    });
    
    tr.addEventListener('dragenter', (e) => {
      tr.classList.add('drag-over');
    });
    
    tr.addEventListener('dragleave', (e) => {
      tr.classList.remove('drag-over');
    });
    
    tr.addEventListener('drop', (e) => {
      e.stopPropagation();
      tr.classList.remove('drag-over');
      
      const sourceIndex = window.draggedRowOriginalIndex;
      const targetIndex = originalIndex;
      
      if (sourceIndex !== undefined && sourceIndex !== null && sourceIndex !== targetIndex) {
        // Move item in array
        const movedItem = inventoryData[sourceIndex];
        inventoryData.splice(sourceIndex, 1);
        inventoryData.splice(targetIndex, 0, movedItem);
        
        applyFilters();
        triggerAutosave();
      }
    });
    
    tr.addEventListener('dragend', (e) => {
      tr.classList.remove('dragging');
      document.querySelectorAll('.inventory-table tr').forEach(row => {
        row.classList.remove('drag-over');
      });
      window.draggedRowOriginalIndex = null;
    });
    
    tr.innerHTML = `
      <td class="text-center drag-handle-cell">
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          <i data-lucide="grip-vertical" style="color: var(--text-secondary); width: 14px; height: 14px; cursor: grab;"></i>
          <span style="font-weight: 600; color: var(--text-secondary); min-width: 14px;">${idx + 1}</span>
          <button class="btn-row-delete" onclick="deleteRow(${originalIndex})" title="刪除此品項" style="padding: 2px;">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </td>
      <td class="img-cell text-center">
        <div class="img-container">
          <img src="${item.image}" alt="supplement image" class="thumbnail-img" onclick="openLightbox(${originalIndex})" onerror="this.src='https://placehold.co/100?text=No+Img'">
          <div class="zoom-preview">
            <img src="${item.image}" onerror="this.src='https://placehold.co/300?text=No+Img'">
          </div>
          <button class="btn-img-upload" onclick="event.stopPropagation(); document.getElementById('file-input-${originalIndex}').click()" title="上傳或更換圖片">
            <i data-lucide="camera" style="width:11px;height:11px;"></i>
          </button>
          <input type="file" id="file-input-${originalIndex}" accept="image/*" style="display:none;" onchange="handleImageUpload(${originalIndex}, this.files)">
        </div>
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(item.name)}" placeholder="請輸入名稱..." oninput="updateField(${originalIndex}, 'name', this.value)">
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(item.spec)}" placeholder="品牌/規格/容量..." oninput="updateField(${originalIndex}, 'spec', this.value)">
      </td>
      <td>
        <input type="number" class="table-input num-input" value="${item.newCount}" placeholder="0" min="0" oninput="updateField(${originalIndex}, 'newCount', this.value, this)">
      </td>
      <td>
        <input type="number" class="table-input num-input" value="${item.openedCount}" placeholder="0" min="0" oninput="updateField(${originalIndex}, 'openedCount', this.value, this)">
      </td>
      <td>
        <input type="number" class="table-input num-input total-bottles-input" value="${item.totalBottles}" placeholder="0" min="0" oninput="updateField(${originalIndex}, 'totalBottles', this.value, this)">
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(item.remarks)}" placeholder="有效期限/購買地點/備註..." oninput="updateField(${originalIndex}, 'remarks', this.value)">
      </td>
    `;
    
    tableBody.appendChild(tr);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Render dynamic card grid
function renderGrid() {
  cardGrid.innerHTML = '';
  
  filteredData.forEach((item) => {
    const originalIndex = inventoryData.findIndex(orig => orig._id === item._id);
    
    const card = document.createElement('div');
    card.className = 'inventory-card';
    
    const isBase64 = item.image.startsWith('data:');
    const displayFilename = isBase64 ? '自訂上傳圖片' : item.image;
    
    card.innerHTML = `
      <div class="card-img-wrapper" onclick="openLightbox(${originalIndex})">
        <img class="card-img" src="${item.image}" alt="supplement image" onerror="this.src='https://placehold.co/300?text=No+Img'">
        <button class="btn-card-delete" onclick="event.stopPropagation(); deleteRow(${originalIndex})" title="刪除此品項">
          <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
        </button>
        <div class="card-img-overlay">
          <span class="card-filename" title="${displayFilename}">${displayFilename}</span>
          <button class="btn-card-zoom" onclick="event.stopPropagation(); openLightbox(${originalIndex})" title="查看大圖">
            <i data-lucide="maximize-2" style="width:14px;height:14px;"></i>
          </button>
        </div>
        <!-- Image uploader overlay on card -->
        <button class="btn-img-upload" style="opacity: 1; bottom: 8px; right: 8px;" onclick="event.stopPropagation(); document.getElementById('file-input-grid-${originalIndex}').click()" title="更換圖片">
          <i data-lucide="camera" style="width:11px;height:11px;"></i>
        </button>
        <input type="file" id="file-input-grid-${originalIndex}" accept="image/*" style="display:none;" onchange="handleImageUpload(${originalIndex}, this.files)">
      </div>
      
      <div class="card-content">
        <!-- Section A (Primary Info) -->
        <div class="card-section">
          <div class="card-section-title">主要規格</div>
          <div class="card-field-row">
            <div class="card-input-group">
              <label>名稱</label>
              <input type="text" class="card-input" value="${escapeHtml(item.name)}" placeholder="請輸入名稱..." oninput="updateField(${originalIndex}, 'name', this.value)">
            </div>
            <div class="card-input-group">
              <label>品牌與規格</label>
              <input type="text" class="card-input" value="${escapeHtml(item.spec)}" placeholder="品牌/規格/容量..." oninput="updateField(${originalIndex}, 'spec', this.value)">
            </div>
          </div>
        </div>

        <!-- Section C (Inventory Levels) -->
        <div class="card-section">
          <div class="card-section-title">庫存數量</div>
          <div class="card-qty-row">
            <div class="card-qty-item">
              <span>總瓶數</span>
              <input type="number" class="card-qty-input total-bottles-input" value="${item.totalBottles}" placeholder="0" min="0" oninput="updateField(${originalIndex}, 'totalBottles', this.value, this)">
            </div>
            <div class="card-qty-item">
              <span>全新</span>
              <input type="number" class="card-qty-input" value="${item.newCount}" placeholder="0" min="0" oninput="updateField(${originalIndex}, 'newCount', this.value, this)">
            </div>
            <div class="card-qty-item">
              <span>已開</span>
              <input type="number" class="card-qty-input" value="${item.openedCount}" placeholder="0" min="0" oninput="updateField(${originalIndex}, 'openedCount', this.value, this)">
            </div>
          </div>
        </div>

        <!-- Section D (Remarks) -->
        <div class="card-input-group">
          <label>備註資訊</label>
          <input type="text" class="card-input" value="${escapeHtml(item.remarks)}" placeholder="保存期限、購買來源等說明..." oninput="updateField(${originalIndex}, 'remarks', this.value)">
        </div>
      </div>
    `;
    
    cardGrid.appendChild(card);
  });
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Update statistics dashboard indicators
function updateStatistics() {
  statTotalItems.innerText = inventoryData.length;
  
  let totalB = 0;
  let newB = 0;
  let openedB = 0;
  
  inventoryData.forEach(item => {
    const total = parseInt(item.totalBottles) || 0;
    const nw = parseInt(item.newCount) || 0;
    const op = parseInt(item.openedCount) || 0;
    
    totalB += total;
    newB += nw;
    openedB += op;
  });
  
  statTotalBottles.innerText = totalB;
  statNewCount.innerText = newB;
  statOpenedCount.innerText = openedB;
}

// Helper to escape HTML tags
function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// Data Operations & Search Filters
// ==========================================================================
function updateField(index, field, value, el) {
  inventoryData[index][field] = value;
  
  if (field === 'newCount' || field === 'openedCount') {
    const nw = parseInt(inventoryData[index].newCount) || 0;
    const op = parseInt(inventoryData[index].openedCount) || 0;
    
    // Sum is always recalculated (handles 0 and clears residual data)
    const calculatedTotal = nw + op;
    inventoryData[index].totalBottles = calculatedTotal;
    
    // Update total input on screen dynamically based on DOM context (prevents sorting index mismatch!)
    if (el) {
      const parentRow = el.closest('tr');
      if (parentRow) {
        const totalInput = parentRow.querySelector('.total-bottles-input');
        if (totalInput) totalInput.value = calculatedTotal;
      }
      const parentCard = el.closest('.inventory-card');
      if (parentCard) {
        const totalInput = parentCard.querySelector('.total-bottles-input');
        if (totalInput) totalInput.value = calculatedTotal;
      }
    }
  }
  
  updateStatistics();
  triggerAutosave();
}

// Delete item row
function deleteRow(index) {
  if (confirm('確定要刪除此品項嗎？')) {
    inventoryData.splice(index, 1);
    applyFilters();
    triggerAutosave();
  }
}

// Image compression and resizing (limits size in data.json)
function handleImageUpload(index, files) {
  const file = files[0];
  if (!file) return;
  
  setSaveStatus('saving');
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Create canvas for resizing
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Limit maximum dimension to 400px to fit Google Sheets 50,000 character limit per cell
      const MAX_DIM = 400;
      if (width > height) {
        if (width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        }
      } else {
        if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Output as compressed JPEG (0.6 quality keeps it extremely light, around 15-20KB)
      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
      
      // Update data
      inventoryData[index].image = compressedBase64;
      
      applyFilters();
      triggerAutosave();
    };
    img.onerror = function() {
      alert('圖片載入失敗，請換一張試試！');
      setSaveStatus('error', '載入失敗');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function triggerAutosave() {
  if (initialLoad) {
    console.log('Autosave skipped: initial data loading.');
    return;
  }

  // Skip save if data has not changed since last successful save
  const currentSnapshot = JSON.stringify(inventoryData.map(stripId));
  if (currentSnapshot === lastSavedSnapshot) {
    console.log('Autosave skipped: data unchanged since last save.');
    return;
  }

  setSaveStatus('saving');
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(async () => {
    try {
      // 1. If Google Script URL is configured, push to Google Sheets
      if (googleScriptUrl) {
        const dataToSend = inventoryData.map(stripId); // Never send internal _id to server
        const response = await fetch(googleScriptUrl, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8' // avoids preflight OPTIONS CORS block
          },
          body: JSON.stringify(dataToSend)
        });
        const res = await response.json();
        if (res && res.success) {
          // Update snapshot so we don't re-save the same data again
          lastSavedSnapshot = JSON.stringify(dataToSend);
          setSaveStatus('saved', '雲端同步成功');
        } else {
          throw new Error((res && res.error) || 'Google Sheet save failed');
        }
        return;
      }

      // 2. Otherwise save locally via python API or LocalStorage
      if (standaloneMode) {
        localStorage.setItem('supplement_inventory_data', JSON.stringify(inventoryData));
        setSaveStatus('saved');
      } else {
        const response = await fetch('/api/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(inventoryData)
        });
        const res = await response.json();
        if (res.success) {
          setSaveStatus('saved');
        } else {
          throw new Error(res.message || 'API failed');
        }
      }
    } catch (e) {
      console.error('Error saving data:', e);
      setSaveStatus('error', '儲存失敗');
      // IMPORTANT: Only fall back to localStorage when NOT using Google Sheets.
      if (!googleScriptUrl) {
        localStorage.setItem('supplement_inventory_data', JSON.stringify(inventoryData));
      }
    }
  }, 1000);
}

function setSaveStatus(status, customText = '') {
  if (status === 'saving') {
    saveStatusIconSaved.style.display = 'none';
    saveStatusIconSaving.style.display = 'inline-block';
    saveStatusText.innerText = '儲存中...';
    saveStatusText.style.color = 'var(--text-secondary)';
  } else if (status === 'saved') {
    saveStatusIconSaved.style.display = 'inline-block';
    saveStatusIconSaving.style.display = 'none';
    saveStatusText.innerText = customText || '資料已儲存';
    saveStatusText.style.color = 'var(--success-color)';
  } else if (status === 'error') {
    saveStatusIconSaved.style.display = 'none';
    saveStatusIconSaving.style.display = 'none';
    saveStatusText.innerText = customText || '連線錯誤';
    saveStatusText.style.color = 'var(--danger-color)';
  }
}

// Search filtering & sorting
function applyFilters() {
  const query = searchInput.value.toLowerCase().trim();
  
  // 1. Filter
  if (query) {
    clearSearchBtn.style.display = 'flex';
    filteredData = inventoryData.filter(item => {
      return (
        item.image.toLowerCase().includes(query) ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.spec && item.spec.toLowerCase().includes(query)) ||
        (item.remarks && item.remarks.toLowerCase().includes(query))
      );
    });
  } else {
    clearSearchBtn.style.display = 'none';
    filteredData = [...inventoryData];
  }
  
  // 2. Sort
  if (sortColumn) {
    filteredData.sort((a, b) => {
      let valA = a[sortColumn] || '';
      let valB = b[sortColumn] || '';
      
      // Handle numeric sorting for quantity columns
      if (['newCount', 'openedCount', 'totalBottles'].includes(sortColumn)) {
        valA = parseInt(valA) || 0;
        valB = parseInt(valB) || 0;
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      } else {
        // Traditional Chinese localeCompare sorting
        return sortDirection === 'asc' 
          ? String(valA).localeCompare(String(valB), 'zh-Hant')
          : String(valB).localeCompare(String(valA), 'zh-Hant');
      }
    });
  }
  
  render();
}

// Header Click Sorting Triggers
window.handleHeaderClick = function(column) {
  if (sortColumn === column) {
    // Toggle direction
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }
  
  updateHeaderSortIcons();
  applyFilters();
};

function updateHeaderSortIcons() {
  const columns = ['name', 'spec', 'newCount', 'openedCount', 'totalBottles'];
  columns.forEach(col => {
    const th = document.getElementById(`th-${col}`);
    if (!th) return;
    
    const span = th.querySelector('.sort-icon-placeholder');
    if (!span) return;
    
    if (sortColumn === col) {
      th.classList.add('active-sort');
      span.innerHTML = sortDirection === 'asc' 
        ? `<i data-lucide="arrow-up" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-left:4px;color:var(--accent-color);"></i>`
        : `<i data-lucide="arrow-down" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-left:4px;color:var(--accent-color);"></i>`;
    } else {
      th.classList.remove('active-sort');
      span.innerHTML = `<i data-lucide="chevrons-up-down" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-left:4px;"></i>`;
    }
  });
  
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ==========================================================================
// Lightbox Modal Controls
// ==========================================================================
function openLightbox(index) {
  currentLightboxIndex = index;
  resetImageTransform();
  
  const item = inventoryData[index];
  if (!item) return;
  
  lightboxImg.src = item.image;
  lightboxCaption.innerText = `${item.image.startsWith('data:') ? '自訂上傳圖片' : item.image} ${item.name ? '- ' + item.name : ''}`;
  
  lightbox.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', handleLightboxKeys);
}

// Close Lightbox
function closeLightbox() {
  lightbox.style.display = 'none';
  document.body.style.overflow = '';
  window.removeEventListener('keydown', handleLightboxKeys);
}

function handleLightboxKeys(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') navigateLightbox(1);
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
}

function navigateLightbox(dir) {
  let nextIndex = currentLightboxIndex + dir;
  if (nextIndex >= inventoryData.length) nextIndex = 0;
  if (nextIndex < 0) nextIndex = inventoryData.length - 1;
  openLightbox(nextIndex);
}

function rotateImage(deg) {
  imgRotation = (imgRotation + deg) % 360;
  applyImageTransform();
}

// Zoom Controls
function zoomImage(factor) {
  imgScale = Math.max(0.5, Math.min(4, imgScale + factor));
  applyImageTransform();
}

function resetImageTransform() {
  imgRotation = 0;
  imgScale = 1;
  applyImageTransform();
}

function applyImageTransform() {
  lightboxImg.style.transform = `scale(${imgScale}) rotate(${imgRotation}deg)`;
}

// ==========================================================================
// Import / Export Operations
// ==========================================================================
function exportCSV() {
  const headers = [
    '圖片檔名', 
    '補給品名稱', 
    '品牌與規格', 
    '全新', 
    '已開', 
    '總瓶數', 
    '備註'
  ];
  
  const rows = inventoryData.map(item => [
    item.image.startsWith('data:') ? 'Base64自訂圖片' : item.image,
    item.name || '',
    item.spec || '',
    item.newCount || '0',
    item.openedCount || '0',
    item.totalBottles || '0',
    item.remarks || ''
  ]);
  
  let csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\r\n';
  rows.forEach(row => {
    csvContent += row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',') + '\r\n';
  });
  
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `保健食品庫存表_${getFormattedDate()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(inventoryData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `保健食品備份_${getFormattedDate()}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (!Array.isArray(data)) {
        throw new Error('資料格式不正確，應為陣列清單');
      }
      if (data.length > 0 && !data[0].hasOwnProperty('image')) {
        throw new Error('匯入資料遺失關鍵 [image] 欄位');
      }
      
      inventoryData = data.map(importedItem => {
        return {
          image: importedItem.image,
          name: importedItem.name || '',
          spec: importedItem.spec || '',
          totalBottles: importedItem.totalBottles || '',
          newCount: importedItem.newCount || '',
          openedCount: importedItem.openedCount || '',
          remarks: importedItem.remarks || ''
        };
      });
      
      applyFilters();
      triggerAutosave();
      alert('備份資料匯入成功！已同步至儲存庫。');
    } catch (err) {
      alert(`匯入失敗: ${err.message}`);
    }
    importFileEl.value = '';
  };
  reader.readAsText(file);
}

function getFormattedDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// ==========================================================================
// Setup Listeners
// ==========================================================================
function setupEventListeners() {
  searchInput.addEventListener('input', applyFilters);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilters();
  });
  
  themeToggleBtn.addEventListener('click', toggleTheme);
  
  viewTableBtn.addEventListener('click', () => {
    currentView = 'table';
    viewTableBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    render();
  });
  
  viewGridBtn.addEventListener('click', () => {
    currentView = 'grid';
    viewGridBtn.classList.add('active');
    viewTableBtn.classList.remove('active');
    render();
  });
  
  // Add item listener
  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      inventoryData.push({
        _id: _nextId++, // Unique ID prevents index collision
        image: 'https://placehold.co/150?text=No+Image', // Default placeholder
        name: '',
        spec: '',
        totalBottles: '',
        newCount: '',
        openedCount: '',
        remarks: ''
      });
      applyFilters();
      
      // Scroll smoothly to bottom
      setTimeout(() => {
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
      
      triggerAutosave();
    });
  }

  // Cloud settings modal elements
  const cloudSettingsBtn = document.getElementById('cloudSettingsBtn');
  const cloudSettingsModal = document.getElementById('cloudSettingsModal');
  const closeCloudSettingsBtn = document.getElementById('closeCloudSettingsBtn');
  const googleUrlInput = document.getElementById('googleUrlInput');
  const testCloudConnectionBtn = document.getElementById('testCloudConnectionBtn');
  const saveCloudSettingsBtn = document.getElementById('saveCloudSettingsBtn');
  const cloudConnectionMsg = document.getElementById('cloudConnectionMsg');
  
  if (cloudSettingsBtn && cloudSettingsModal) {
    // Open Modal
    cloudSettingsBtn.addEventListener('click', () => {
      googleUrlInput.value = googleScriptUrl;
      cloudConnectionMsg.innerText = '';
      cloudSettingsModal.style.display = 'flex';
    });
    
    // Close Modal
    closeCloudSettingsBtn.addEventListener('click', () => {
      cloudSettingsModal.style.display = 'none';
    });
    
    // Test Connection
    testCloudConnectionBtn.addEventListener('click', async () => {
      const url = googleUrlInput.value.trim();
      if (!url) {
        cloudConnectionMsg.style.color = 'var(--danger-color)';
        cloudConnectionMsg.innerText = '請先貼上 Web App 網址！';
        return;
      }
      
      cloudConnectionMsg.style.color = 'var(--text-color)';
      cloudConnectionMsg.innerText = '正在測試連線中...';
      
      try {
        const response = await fetch(url);
        const result = await response.json();
        
        // Handle direct array or success wrapper
        if (result && (Array.isArray(result) || result.success || (result.data && Array.isArray(result.data)))) {
          cloudConnectionMsg.style.color = 'var(--success-color)';
          cloudConnectionMsg.innerText = '✅ 連線成功！可以正常讀取資料。';
        } else {
          throw new Error('格式錯誤');
        }
      } catch (err) {
        cloudConnectionMsg.style.color = 'var(--danger-color)';
        cloudConnectionMsg.innerText = '❌ 連線失敗，請檢查網址或權限設定！';
        console.error(err);
      }
    });
    
    // Save Settings
    saveCloudSettingsBtn.addEventListener('click', () => {
      googleScriptUrl = googleUrlInput.value.trim();
      localStorage.setItem('google_script_url', googleScriptUrl);
      cloudSettingsModal.style.display = 'none';
      
      // Reload data using the new URL
      loadData();
    });
  }
  
  lightboxClose.addEventListener('click', closeLightbox);
  lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
  lightboxNext.addEventListener('click', () => navigateLightbox(1));
  
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });
}

// Resizable Columns Engine
function initResizableColumns() {
  const table = document.querySelector('.inventory-table');
  if (!table) return;
  const cols = table.querySelectorAll('th');
  
  // Load saved widths from localStorage
  let savedWidths = {};
  try {
    const stored = localStorage.getItem('supplement_column_widths');
    if (stored) {
      savedWidths = JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error reading column widths from localStorage:', e);
  }
  
  cols.forEach((col, idx) => {
    // Apply saved width if exists
    const colKey = `col-${idx}`;
    if (savedWidths[colKey]) {
      col.style.width = savedWidths[colKey] + 'px';
    }
    
    // Do not append resizer to the very last column (Remarks)
    if (idx === cols.length - 1) return;
    
    // Create resizer element
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    col.appendChild(resizer);
    
    let startX, startWidth;
    
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevents click-to-sort headers from firing!
      
      startX = e.clientX;
      startWidth = col.offsetWidth;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      resizer.classList.add('resizing');
    });
    
    function onMouseMove(e) {
      const width = startWidth + (e.clientX - startX);
      const finalWidth = Math.max(40, width); // Limit minimum width to 40px
      col.style.width = finalWidth + 'px';
    }
    
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      resizer.classList.remove('resizing');
      
      // Save all current widths to localStorage
      const currentWidths = {};
      cols.forEach((th, i) => {
        currentWidths[`col-${i}`] = th.offsetWidth;
      });
      localStorage.setItem('supplement_column_widths', JSON.stringify(currentWidths));
    }
  });
}
