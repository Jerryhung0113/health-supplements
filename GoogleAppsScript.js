// ==========================================================================
// Google Apps Script - Supplement Inventory System Backend Code
// ==========================================================================
// 說明：請複製本檔案內容，並覆蓋貼上到您 Google 雲端硬碟中的 Apps Script 編輯器內。
// 部署完成後，請將「網頁應用程式 URL」複製並貼到本系統的「雲端設定」內。

function doPost(e) {
  // 1. 取得指令碼鎖定（Script Lock），防止多人同時寫入發生覆蓋或衝突
  var lock = LockService.getScriptLock();
  
  try {
    // 嘗試取得鎖定，最長等待 10 秒（10000 毫秒）
    lock.waitLock(10000);
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents);
    
    // 2. 解析前端傳送過來的資料並寫入試算表
    if (Array.isArray(payload)) {
      for (var i = 0; i < payload.length; i++) {
        var item = payload[i];
        // 依照前端定義的 schema 欄位依序使用 appendRow 追加一行
        sheet.appendRow([
          item.image || '',
          item.name || '',
          item.spec || '',
          item.totalBottles || '',
          item.newCount || '',
          item.openedCount || '',
          item.remarks || ''
        ]);
      }
    } else {
      // 單筆資料備用處理
      sheet.appendRow([
        payload.image || '',
        payload.name || '',
        payload.spec || '',
        payload.totalBottles || '',
        payload.newCount || '',
        payload.openedCount || '',
        payload.remarks || ''
      ]);
    }
    
    // 傳回成功 JSON
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    // 傳回失敗 JSON 與錯誤訊息
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } finally {
    // 3. 確保不論成功或失敗，都一定會釋放鎖定以利下一位使用者寫入
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var result = [];
    
    // 從第 2 行開始讀取資料（第 1 行通常為標題欄位）
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[1] && !row[0]) continue; // 略過空白列
      result.push({
        image: row[0],
        name: row[1],
        spec: row[2],
        totalBottles: row[3],
        newCount: row[4],
        openedCount: row[5],
        remarks: row[6]
      });
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
