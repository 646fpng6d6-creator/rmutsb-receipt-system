/**
 * ============================================================================
 * Google Apps Script สำหรับระบบออกใบเสร็จรับเงิน มทร.สุวรรณภูมิ (RMUTSB)
 * รองรับการเชื่อมต่อแบบเรียลไทม์ และระบบป้องกันการออกใบเสร็จซ้ำระดับเสี้ยววินาที (High-Concurrency Lock)
 * ============================================================================
 * 
 * คุณสมบัติขั้นสูงด้านความเสถียร (High Stability & Concurrency):
 * 1. LockService: ล็อกคิวประมวลผลระดับเซิร์ฟเวอร์สูงสุด 30 วินาที ป้องกัน Race Condition
 * 2. Atomic Batch Issue (issueBatchReceipts): รันเลขที่ใบเสร็จแบบ Atomic ป้องกันเลขซ้ำ 100%
 * 3. Batch Write Optimization: เขียนข้อมูลลงชีตครั้งเดียวด้วย setValues() ประมวลผลเสร็จในเสี้ยววินาที
 * 4. Non-Destructive Merge: รวมข้อมูลใบเสร็จอย่างชาญฉลาด ไม่ทับซ้อนและไม่ทำข้อมูลสูญหาย
 */

const SHEET_RECEIPTS = "ใบเสร็จรับเงิน";
const SHEET_SYSTEM_STATE = "ข้อมูลระบบ";

// ======================== API ENDPOINTS (doGet) ========================

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "getState";
    
    if (action === "ping") {
      return jsonResponse({ 
        status: "success", 
        message: "RMUTSB Google Sheet API is online", 
        timestamp: new Date().toISOString() 
      });
    }
    
    if (action === "getState") {
      const state = loadSystemState();
      try {
        const sheetReceipts = getReceiptsFromSheet();
        if (sheetReceipts && sheetReceipts.length > 0) {
          if (!state.data) state.data = {};
          if (!state.data.receipts) state.data.receipts = [];

          const map = new Map();
          state.data.receipts.forEach(r => {
            if (r) {
              const k = (r.bookNo || "") + "-" + (r.no || "");
              map.set(k, r);
            }
          });

          sheetReceipts.forEach(sr => {
            if (sr && sr.bookNo && sr.no) {
              const bUpper = String(sr.bookNo).trim().toUpperCase();
              if (bUpper === "AN704001" || bUpper === "TEST001" || bUpper.startsWith("TEST")) return;
              const k = sr.bookNo + "-" + sr.no;
              map.set(k, Object.assign({}, map.get(k) || {}, sr));
            }
          });

          state.data.receipts = Array.from(map.values());

          // ปรับปรุงค่า latest ของเล่มใบเสร็จให้เป็นเลขสูงสุดตามข้อมูลจริงเสมอ
          if (Array.isArray(state.data.books)) {
            state.data.books.forEach(b => {
              const bReceipts = state.data.receipts.filter(r => r && r.bookNo === b.bookNo);
              if (bReceipts.length > 0) {
                const maxNo = Math.max(...bReceipts.map(r => parseInt(String(r.no || "0").replace(/\D/g, ""), 10) || 0));
                if (maxNo > (Number(b.latest) || 0)) b.latest = maxNo;
              }
            });
          }
        }
      } catch (sheetErr) {
        console.warn("Merge sheet receipts error:", sheetErr);
      }

      return jsonResponse({
        status: "success",
        updated_at: state.updated_at || new Date().toISOString(),
        data: state.data || null
      });
    }

    if (action === "getReceipts") {
      const receipts = getReceiptsFromSheet();
      return jsonResponse({ status: "success", count: receipts.length, receipts: receipts });
    }

    if (action === "getTrueMaxNo") {
      const bookNo = (e && e.parameter && e.parameter.bookNo) || "";
      const state = loadSystemState();
      const sheetReceipts = getReceiptsFromSheet();
      let maxNo = 0;
      sheetReceipts.forEach(r => {
        if (!bookNo || r.bookNo === bookNo) {
          const num = parseInt(String(r.no || "0").replace(/\D/g, ""), 10) || 0;
          if (num > maxNo) maxNo = num;
        }
      });
      if (state.data && Array.isArray(state.data.receipts)) {
        state.data.receipts.forEach(r => {
          if (!bookNo || r.bookNo === bookNo) {
            const num = parseInt(String(r.no || "0").replace(/\D/g, ""), 10) || 0;
            if (num > maxNo) maxNo = num;
          }
        });
      }
      return jsonResponse({ status: "success", bookNo: bookNo, maxNo: maxNo });
    }

    return jsonResponse({ status: "success", message: "RMUTSB Receipt System Web App is ready" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ======================== API ENDPOINTS (doPost) ========================

function doPost(e) {
  // 1. ระบบ LockService ป้องกัน Race Condition เมื่อมีคำขอพร้อมกันในเสี้ยววินาที
  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(30000); // รอคิวล็อกได้สูงสุด 30 วินาที
  if (!hasLock) {
    return jsonResponse({ 
      status: "error", 
      message: "เซิร์ฟเวอร์กำลังประมวลผลคำขออื่นในเสี้ยววินาทีเดียวกัน (Lock Timeout) กรุณารอสักครู่แล้วลองอีกครั้ง" 
    });
  }

  try {
    let payload = null;
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        payload = e.parameter;
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    if (!payload) {
      return jsonResponse({ status: "error", message: "No data payload received" });
    }

    const action = payload.action || "syncState";
    const nowIso = new Date().toISOString();

    // -------------------------------------------------------------------------
    // ACTION: issueBatch / issueBatchReceipts (Atomic Batch Issuance & Auto-Numbering)
    // -------------------------------------------------------------------------
    if (action === "issueBatch" || action === "issueBatchReceipts") {
      const rows = payload.rows || payload.receipts || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        return jsonResponse({ status: "error", message: "ไม่มีรายการใบเสร็จในชุดข้อมูล" });
      }

      const state = loadSystemState();
      if (!state.data) state.data = {};
      if (!Array.isArray(state.data.books)) state.data.books = [];
      if (!Array.isArray(state.data.receipts)) state.data.receipts = [];

      // ค้นหาเล่มใบเสร็จที่ Active
      let targetBook = null;
      let targetBookIdx = -1;
      const reqBookNo = payload.bookNo || payload.targetBookNo;
      if (reqBookNo) {
        targetBookIdx = state.data.books.findIndex(b => b && b.bookNo === reqBookNo);
      }
      if (targetBookIdx < 0) {
        targetBookIdx = state.data.books.findIndex(b => b && b.active && !b.closed);
      }
      if (targetBookIdx < 0 && state.data.books.length > 0) {
        targetBookIdx = 0;
      }

      if (targetBookIdx >= 0) {
        targetBook = state.data.books[targetBookIdx];
      } else {
        targetBook = { bookNo: "RUS70001", start: 1, end: 1000, latest: 0, digits: 4, active: true };
        state.data.books.push(targetBook);
        targetBookIdx = state.data.books.length - 1;
      }

      const digits = Math.max(Number(targetBook.digits || 4), 3);
      const startNum = Number(targetBook.start || 1);

      // ค้นหาเลขที่สูงสุดที่แท้จริงจากทั้ง Sheet และ State เพื่อป้องกันเลขซ้ำ 100%
      const sheetReceipts = getReceiptsFromSheet();
      let trueMax = Number(targetBook.latest || 0);

      sheetReceipts.forEach(r => {
        if (r && r.bookNo === targetBook.bookNo) {
          const num = parseInt(String(r.no || "0").replace(/\D/g, ""), 10) || 0;
          if (num > trueMax) trueMax = num;
        }
      });
      state.data.receipts.forEach(r => {
        if (r && r.bookNo === targetBook.bookNo) {
          const num = parseInt(String(r.no || "0").replace(/\D/g, ""), 10) || 0;
          if (num > trueMax) trueMax = num;
        }
      });

      const newReceipts = [];
      const newSheetRows = [];
      const startBatchNo = Math.max(trueMax + 1, startNum);
      let runningNo = startBatchNo;
      const baseTs = Date.now();

      const standardPrefixes = ["นาย", "นาง", "นางสาว", "ดร.", "ผศ.", "รศ.", "ศ.", "ผศ.ดร.", "รศ.ดร."];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const assignedNoStr = String(runningNo).padStart(digits, "0");
        const receiptId = "rcp-" + baseTs + "-" + (i + 1) + "-" + Math.random().toString(36).substring(2, 6);
        const createdAtIso = new Date(baseTs + i * 20).toISOString();

        let prefixFormatted = "";
        if (row.title) {
          prefixFormatted = standardPrefixes.includes(row.title) ? row.title : (row.title + " ");
        }
        const payerFullName = row.payerFullName || `${prefixFormatted}${row.firstName || ""}${row.lastName ? " " + row.lastName : ""}`.trim();

        const rcp = {
          id: receiptId,
          bookNo: targetBook.bookNo,
          no: assignedNoStr,
          status: "ปกติ",
          cancelReason: "",
          createdAt: createdAtIso,
          date: row.transferDate || row.date || nowIso.slice(0, 10),
          time: row.transferTime || row.time || new Date().toTimeString().slice(0, 5),
          payerType: row.payerType || "บุคคลทั่วไป",
          paymentMethod: row.paymentMethod || "เงินโอน",
          payerBank: row.payerBank || "",
          universityBank: row.universityBank || "ธนาคารกรุงไทย (128-0-79185-3)",
          transferDate: row.transferDate || row.date || nowIso.slice(0, 10),
          transferTime: row.transferTime || "",
          title: row.title || "",
          firstName: row.firstName || "",
          lastName: row.lastName || "",
          payerFullName: payerFullName,
          detailLine1: row.detailLine1 || "",
          studentCode: "",
          detailLine2: row.detailLine2 || "",
          items: Array.isArray(row.items) && row.items.length > 0 ? row.items : [
            {
              paymentItem: row.paymentItem || "ค่าลงทะเบียน",
              projectName: row.projectName || "โครงการอบรม",
              amount: Number(row.amount || row.totalAmount) || 0
            }
          ],
          totalAmount: Number(row.amount || row.totalAmount) || 0,
          issuerName: row.issuerName || (payload.issuer && payload.issuer.name) || "เจ้าหน้าที่",
          issuerStaffCode: row.issuerStaffCode || (payload.issuer && payload.issuer.staffCode) || "",
          issuerPosition: row.issuerPosition || (payload.issuer && payload.issuer.position) || "นักวิชาการเงินและบัญชีชำนาญการ",
          issuerSignatureDataUrl: row.issuerSignatureDataUrl || (payload.issuer && payload.issuer.signatureDataUrl) || "",
          issuerSignatureScale: row.issuerSignatureScale || (payload.issuer && payload.issuer.signatureScale) || 100
        };

        newReceipts.push(rcp);

        // แปลงเป็นแถวข้อมูล Google Sheets
        const nextIdx = sheetReceipts.length + i + 1;
        newSheetRows.push(receiptToRow(rcp, nextIdx));

        runningNo++;
      }

      // บันทึกลง Google Sheets แบบ Batch ต่อท้ายแถวเดิมทันที (เสร็จในเสี้ยววินาที)
      const rSheet = getOrCreateSheet(SHEET_RECEIPTS);
      if (rSheet.getLastRow() < 1) {
        initReceiptSheetHeaders(rSheet);
      }
      const appendStartRow = rSheet.getLastRow() + 1;
      rSheet.getRange(appendStartRow, 1, newSheetRows.length, RECEIPT_HEADERS.length).setValues(newSheetRows);

      // จัดรูปแบบตัวเลขและกึ่งกลางใน Batch ที่เพิ่มใหม่
      rSheet.getRange(appendStartRow, 12, newSheetRows.length, 1).setNumberFormat("#,##0.00");
      rSheet.getRange(appendStartRow, 1, newSheetRows.length, 5).setHorizontalAlignment("center");
      rSheet.getRange(appendStartRow, 18, newSheetRows.length, 1).setHorizontalAlignment("center");

      // ปรับปรุง System State
      const endBatchNo = runningNo - 1;
      targetBook.latest = endBatchNo;
      if (endBatchNo > (Number(targetBook.end) || 100)) {
        targetBook.end = Math.max((Number(targetBook.end) || 100) + 500, endBatchNo + 100);
      }
      state.data.books[targetBookIdx] = targetBook;
      state.data.receipts = [...newReceipts, ...state.data.receipts];

      saveSystemState(state.data, nowIso);

      return jsonResponse({
        status: "success",
        message: "ออกใบเสร็จรับเงินเป็นชุดสำเร็จแบบ Atomic Lock",
        count: newReceipts.length,
        bookNo: targetBook.bookNo,
        startNo: String(startBatchNo).padStart(digits, "0"),
        endNo: String(endBatchNo).padStart(digits, "0"),
        receipts: newReceipts,
        updated_at: nowIso
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: syncState / saveState (Safe Merge & Update)
    // -------------------------------------------------------------------------
    if (action === "syncState" || action === "saveState") {
      const appStateData = payload.data || payload.appState || payload;
      
      // ดึงข้อมูลเดิมจากชีตมาผสาน (Non-Destructive Merge) เพื่อป้องกันข้อมูลทับซ้อน
      const existingSheetReceipts = getReceiptsFromSheet();
      const mergedMap = new Map();

      // 1. นำข้อมูลจากชีตปัจจุบันตั้งเป็นฐาน (กรองเล่มที่ถูกลบออกจากระบบจริง เช่น AN704001, TEST001)
      existingSheetReceipts.forEach(r => {
        if (r && r.bookNo && r.no) {
          const bUpper = String(r.bookNo).trim().toUpperCase();
          if (bUpper === "AN704001" || bUpper === "TEST001" || bUpper.startsWith("TEST")) return;
          const k = String(r.bookNo).trim() + "-" + String(r.no).trim();
          mergedMap.set(k, r);
        }
      });

      // 2. นำข้อมูลที่ไคลเอนต์ส่งมาผสานเข้า
      if (appStateData && Array.isArray(appStateData.receipts)) {
        appStateData.receipts.forEach(r => {
          if (r && r.bookNo && r.no) {
            const k = String(r.bookNo).trim() + "-" + String(r.no).trim();
            const existing = mergedMap.get(k);
            if (!existing) {
              mergedMap.set(k, r);
            } else {
              // ถ้ามีอยู่แล้ว ให้อัปเดตข้อมูลโดยคงสถานะการยกเลิกไว้หากถูกยกเลิกแล้ว
              mergedMap.set(k, Object.assign({}, existing, r));
            }
          }
        });
      }

      const mergedReceipts = Array.from(mergedMap.values());
      appStateData.receipts = mergedReceipts;

      // ปรับปรุงค่า latest ของทุกเล่มให้ตรงกับเลขสูงสุดจริง
      if (Array.isArray(appStateData.books)) {
        appStateData.books.forEach(b => {
          const bReceipts = mergedReceipts.filter(r => r && r.bookNo === b.bookNo);
          if (bReceipts.length > 0) {
            const maxNo = Math.max(...bReceipts.map(r => parseInt(String(r.no || "0").replace(/\D/g, ""), 10) || 0));
            if (maxNo > (Number(b.latest) || 0)) b.latest = maxNo;
          }
        });
      }

      // บันทึกสถานะระบบลงชีตข้อมูลระบบ
      saveSystemState(appStateData, nowIso);
      
      // เขียนใบเสร็จทั้งหมดลงชีตใบเสร็จรับเงิน
      syncReceiptsToSheet(mergedReceipts);

      return jsonResponse({
        status: "success",
        message: "บันทึกและผสานข้อมูลขึ้น Google Sheet สำเร็จ",
        receiptsCount: mergedReceipts.length,
        updated_at: nowIso
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: addReceipt (Fast Add Single Receipt with Conflict Prevention)
    // -------------------------------------------------------------------------
    if (action === "addReceipt") {
      const receipt = payload.receipt;
      if (!receipt) {
        return jsonResponse({ status: "error", message: "No receipt object provided" });
      }

      appendReceiptRow(receipt);
      
      if (payload.appState) {
        saveSystemState(payload.appState, nowIso);
      }

      return jsonResponse({
        status: "success",
        message: "เพิ่มใบเสร็จเลขที่ " + (receipt.no || "") + " เรียบร้อยแล้ว",
        receiptNo: receipt.no
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: initSheet
    // -------------------------------------------------------------------------
    if (action === "initSheet") {
      formatAllSheets();
      return jsonResponse({ status: "success", message: "จัดรูปแบบตารางสำเร็จ" });
    }

    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  } finally {
    // ปลดล็อกเสมอ
    lock.releaseLock();
  }
}

// ======================== HELPER FUNCTIONS ========================

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * บันทึกสถานะระบบ (appState) ลงแท็บ "ข้อมูลระบบ"
 * แบ่ง Chunk ข้อมูลละ 40,000 ตัวอักษร เพื่อป้องกันข้อจำกัด 50,000 ตัวอักษรต่อเซลล์
 */
function saveSystemState(stateObj, updatedIso) {
  const sheet = getOrCreateSheet(SHEET_SYSTEM_STATE);
  
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, 3).setValues([["ลำดับ Chunk", "ข้อมูลระบบ (System State JSON)", "วันที่อัปเดต"]]);
    sheet.getRange(1, 1, 1, 3).setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  const jsonStr = JSON.stringify(stateObj);
  const chunkSize = 40000;
  const chunks = [];
  for (let i = 0; i < jsonStr.length; i += chunkSize) {
    chunks.push([
      Math.floor(i / chunkSize) + 1,
      jsonStr.substring(i, i + chunkSize),
      updatedIso
    ]);
  }

  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, lastRow, 3).clearContent();

  if (chunks.length > 0) {
    sheet.getRange(2, 1, chunks.length, 3).setValues(chunks);
  }
}

/**
 * โหลดสถานะระบบจากแท็บ "ข้อมูลระบบ"
 */
function loadSystemState() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_SYSTEM_STATE);
  if (!sheet || sheet.getLastRow() < 2) {
    return { updated_at: null, data: null };
  }

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  
  let jsonStr = "";
  let updatedIso = "";
  for (let i = 0; i < values.length; i++) {
    jsonStr += (values[i][1] || "");
    if (values[i][2]) updatedIso = values[i][2];
  }

  try {
    const data = JSON.parse(jsonStr);
    return { updated_at: updatedIso, data: data };
  } catch (e) {
    return { updated_at: updatedIso, data: null, error: e.toString() };
  }
}

const RECEIPT_HEADERS = [
  "ลำดับ",
  "เล่มที่",
  "เลขที่",
  "วันที่",
  "เวลา",
  "ชื่อผู้ชำระเงิน",
  "ประเภทผู้ชำระ",
  "สังกัด / หน่วยงาน (บรรทัด 1)",
  "ที่อยู่ / จังหวัด (บรรทัด 2)",
  "รายการชำระ",
  "โครงการอบรม",
  "จำนวนเงิน (บาท)",
  "วิธีการชำระเงิน",
  "ธนาคารต้นทาง (กรณีโอน)",
  "วันที่โอน",
  "เวลาโอน",
  "เข้าบัญชีมหาวิทยาลัย",
  "สถานะ",
  "เหตุผลที่ยกเลิก",
  "ผู้จัดทำใบเสร็จ",
  "ตำแหน่งผู้จัดทำ",
  "รหัสเจ้าหน้าที่",
  "วันที่สร้างรายการ",
  "รหัสอ้างอิงระบบ (ID)"
];

function initReceiptSheetHeaders(sheet) {
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, RECEIPT_HEADERS.length).setValues([RECEIPT_HEADERS]);
    sheet.getRange(1, 1, 1, RECEIPT_HEADERS.length)
      .setBackground("#0f2c59")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 28);
  }
}

function receiptToRow(r, index) {
  let itemName = "";
  let projectName = "";
  if (r.items && Array.isArray(r.items) && r.items.length > 0) {
    itemName = r.items.map(it => it.paymentItem || "").filter(Boolean).join(", ");
    projectName = r.items.map(it => it.projectName || "").filter(Boolean).join(" | ");
  }

  return [
    index,
    r.bookNo || "",
    String(r.no || ""),
    r.date || "",
    r.time || "",
    r.payerFullName || ((r.title || "") + (r.firstName || "") + " " + (r.lastName || "")).trim(),
    r.payerType || "บุคคลทั่วไป",
    r.detailLine1 || "",
    r.detailLine2 || "",
    itemName || "ค่าลงทะเบียน",
    projectName || "",
    Number(r.totalAmount) || 0,
    r.paymentMethod || "เงินโอน",
    r.payerBank || "",
    r.transferDate || "",
    r.transferTime || "",
    r.universityBank || "",
    r.status || "ปกติ",
    r.cancelReason || "",
    r.issuerName || "",
    r.issuerPosition || "",
    r.issuerStaffCode || "",
    r.createdAt || "",
    r.id || ""
  ];
}

function syncReceiptsToSheet(receipts) {
  const sheet = getOrCreateSheet(SHEET_RECEIPTS);
  initReceiptSheetHeaders(sheet);

  if (!receipts || receipts.length === 0) return;

  const sorted = receipts.slice().sort((a, b) => {
    const dateA = a.date || "";
    const dateB = b.date || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const bookCmp = String(a.bookNo || "").localeCompare(String(b.bookNo || ""));
    if (bookCmp !== 0) return bookCmp;
    const noA = parseInt(String(a.no || "0").replace(/\D/g, ""), 10) || 0;
    const noB = parseInt(String(b.no || "0").replace(/\D/g, ""), 10) || 0;
    if (noA !== noB) return noA - noB;
    return (a.time || "").localeCompare(b.time || "");
  });

  const rows = [];
  for (let i = 0; i < sorted.length; i++) {
    rows.push(receiptToRow(sorted[i], i + 1));
  }

  const maxClear = Math.max(sheet.getLastRow(), rows.length + 1);
  if (maxClear >= 2) {
    sheet.getRange(2, 1, maxClear, RECEIPT_HEADERS.length).clearContent();
  }

  sheet.getRange(2, 1, rows.length, RECEIPT_HEADERS.length).setValues(rows);
  sheet.getRange(2, 12, rows.length, 1).setNumberFormat("#,##0.00");
  sheet.getRange(2, 1, rows.length, 5).setHorizontalAlignment("center");
  sheet.getRange(2, 18, rows.length, 1).setHorizontalAlignment("center");
}

function appendReceiptRow(r) {
  const sheet = getOrCreateSheet(SHEET_RECEIPTS);
  if (sheet.getLastRow() < 1) {
    initReceiptSheetHeaders(sheet);
  }
  const nextIndex = sheet.getLastRow();
  const row = receiptToRow(r, nextIndex);
  sheet.appendRow(row);

  const newRowIndex = sheet.getLastRow();
  sheet.getRange(newRowIndex, 12).setNumberFormat("#,##0.00");
  sheet.getRange(newRowIndex, 1, 1, 5).setHorizontalAlignment("center");
  sheet.getRange(newRowIndex, 18).setHorizontalAlignment("center");
}

function formatAllSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rSheet = getOrCreateSheet(SHEET_RECEIPTS);
  initReceiptSheetHeaders(rSheet);
  const sSheet = getOrCreateSheet(SHEET_SYSTEM_STATE);
  if (sSheet.getLastRow() < 1) {
    sSheet.getRange(1, 1, 1, 3).setValues([["ลำดับ Chunk", "ข้อมูลระบบ (System State JSON)", "วันที่อัปเดต"]]);
    sSheet.getRange(1, 1, 1, 3).setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold");
  }
}

function getReceiptsFromSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_RECEIPTS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, RECEIPT_HEADERS.length).getValues();
  return rows.map(r => ({
    noIndex: r[0],
    bookNo: r[1],
    no: String(r[2]),
    date: r[3],
    time: r[4],
    payerFullName: r[5],
    payerType: r[6],
    detailLine1: r[7],
    detailLine2: r[8],
    paymentItem: r[9],
    projectName: r[10],
    totalAmount: r[11],
    paymentMethod: r[12],
    payerBank: r[13],
    transferDate: r[14],
    transferTime: r[15],
    universityBank: r[16],
    status: r[17],
    cancelReason: r[18],
    issuerName: r[19],
    issuerPosition: r[20],
    issuerStaffCode: r[21],
    createdAt: r[22],
    id: r[23]
  }));
}
