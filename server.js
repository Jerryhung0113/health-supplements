const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
// Serve static files from the current directory
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'data.json');

// Helper to scan directory for JPG files
function getImages() {
  try {
    const files = fs.readdirSync(__dirname);
    return files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp';
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch (err) {
    console.error('Error scanning images:', err);
    return [];
  }
}

// Helper to initialize or merge data.json
function getMergedData() {
  const images = getImages();
  let existingData = [];

  if (fs.existsSync(DATA_FILE)) {
    try {
      const content = fs.readFileSync(DATA_FILE, 'utf8');
      existingData = JSON.parse(content);
      if (!Array.isArray(existingData)) {
        existingData = [];
      }
    } catch (e) {
      console.error('Error reading data.json, resetting to empty array:', e);
      existingData = [];
    }
  }

  // If data.json already has items, return them directly to prevent duplication
  if (existingData.length > 0) {
    return existingData;
  }

  // Otherwise, initialize from folder images
  const merged = images.map(imgName => {
    return {
      image: imgName,
      name: '',
      spec: '',
      totalBottles: '',
      newCount: '',
      openedCount: '',
      remarks: ''
    };
  });

  return merged;
}

// API: Get all items
app.get('/api/data', (req, res) => {
  const data = getMergedData();
  res.json({
    success: true,
    data: data
  });
});

// API: Save data
app.post('/api/save', (req, res) => {
  const clientData = req.body;
  if (!Array.isArray(clientData)) {
    return res.status(400).json({ success: false, message: 'Invalid data format' });
  }

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(clientData, null, 2), 'utf8');
    res.json({ success: true, message: 'Data saved successfully' });
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).json({ success: false, message: 'Failed to write data file' });
  }
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`保健食品庫存管理系統已啟動！`);
  console.log(`請在瀏覽器中開啟: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
