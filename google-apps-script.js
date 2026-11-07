/**
 * ============================================================================
 * Google Apps Script สำหรับระบบออกใบเสร็จรับเงิน มทร.สุวรรณภูมิ (RMUTSB)
 * รองรับการเชื่อมต่อแบบเรียลไทม์ผ่าน Google Sheet Web App
 * ============================================================================
 * 
 * วิธีการนำไปติดตั้งใช้งาน:
 * 1. เปิด Google Sheets เปล่าใหม่ขึ้นมา 1 ไฟล์ (หรือไฟล์ที่มีอยู่แล้ว)
 * 2. ไปที่เมนู "ส่วนขยาย" (Extensions) -> "Apps Script"
 * 3. ลบโค้ดเดิมออกทั้งหมด แล้ววางโค้ดในไฟล์นี้ลงไปทั้งหมด แล้วกดบันทึก (Ctrl+S หรือ Cmd+S)
 * 4. คลิกปุ่มสีน้ำเงิน "การทำให้ใช้งานได้" (Deploy) -> "การทำให้ใช้งานได้รายการใหม่" (New deployment)
 * 5. เลือกประเภท (รูปฟันเฟือง): "เว็บแอป" (Web app)
 * 6. ตั้งค่าดังนี้:
 *    - คำอธิบาย: ระบบออกใบเสร็จ RMUTSB
 *    - ดำเนินการในฐานะ (Execute as): "ฉัน (อีเมลของคุณ)" (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): "ทุกคน" (Anyone)   <-- สำคัญมาก! ต้องเลือก Anyone
 * 7. คลิก "การทำให้ใช้งานได้" (Deploy) -> ให้สิทธิ์เข้าถึง (Authorize access)
 * 8. คัดลอก "URL ของเว็บแอป" (Web app URL) ที่ได้ (ขึ้นต้นด้วย https://script.google.com/macros/s/.../exec)
 * 9. นำ URL ไปใส่ในหน้าต่าง "ตั้งค่าฐานข้อมูล Google Sheet" บนหน้าเว็บระบบออกใบเสร็จ
 */

const SHEET_RECEIPTS = "ใบเสร็จรับเงิน";
const SHEET_SYSTEM_STATE = "ข้อมูลระบบ";

// ======================== API ENDPOINTS ========================

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "getState";
    
    if (action === "ping") {
      return jsonResponse({ status: "success", message: "RMUTSB Google Sheet API is online", timestamp: new Date().toISOString() });
    }
    
    if (action === "getState") {
      const state = loadSystemState();
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

    return jsonResponse({ status: "success", message: "RMUTSB Receipt System Web App is ready" });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
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

    // 1. ซิงค์ข้อมูลทั้งระบบ (รวมใบเสร็จทั้งหมด, โครงการ, บัญชีธนาคาร, ผู้ใช้งาน, ลายเซ็น)
    if (action === "syncState" || action === "saveState") {
      const appStateData = payload.data || payload.appState || payload;
      const nowIso = new Date().toISOString();
      
      // บันทึกสถานะระบบลงชีตข้อมูลระบบ
      saveSystemState(appStateData, nowIso);
      
      // บันทึกหรืออัปเดตใบเสร็จลงชีตใบเสร็จรับเงินแบบเรียงแถว
      let receiptsCount = 0;
      if (appStateData && Array.isArray(appStateData.receipts)) {
        syncReceiptsToSheet(appStateData.receipts);
        receiptsCount = appStateData.receipts.length;
      }

      return jsonResponse({
        status: "success",
        message: "บันทึกข้อมูลขึ้น Google Sheet สำเร็จ",
        receiptsCount: receiptsCount,
        updated_at: nowIso
      });
    }

    // 2. เพิ่มใบเสร็จใบใหม่ทันที (Fast Add Receipt)
    if (action === "addReceipt") {
      const receipt = payload.receipt;
      if (!receipt) {
        return jsonResponse({ status: "error", message: "No receipt object provided" });
      }
      appendReceiptRow(receipt);
      
      // อัปเดต state ด้วยหากส่งมาด้วย
      if (payload.appState) {
        saveSystemState(payload.appState, new Date().toISOString());
      }

      return jsonResponse({
        status: "success",
        message: "เพิ่มใบเสร็จเลขที่ " + (receipt.no || "") + " เรียบร้อยแล้ว",
        receiptNo: receipt.no
      });
    }

    // 3. เริ่มต้นจัดรูปแบบตาราง (Init/Format Sheet)
    if (action === "initSheet") {
      formatAllSheets();
      return jsonResponse({ status: "success", message: "จัดรูปแบบตารางสำเร็จ" });
    }

    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
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
 * รองรับการแบ่ง Chunk ข้อมูลละ 40,000 ตัวอักษร เพื่อป้องกันข้อจำกัด 50,000 ตัวอักษรต่อเซลล์ของ Google Sheets
 */
function saveSystemState(stateObj, updatedIso) {
  const sheet = getOrCreateSheet(SHEET_SYSTEM_STATE);
  
  // สร้าง Header ถ้ายังไม่มี
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

  // ล้างข้อมูลเดิมแถวที่ 2 เป็นต้นไป
  const lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 1, lastRow, 3).clearContent();

  // เขียนข้อมูล Chunk ใหม่ลงไป
  if (chunks.length > 0) {
    sheet.getRange(2, 1, chunks.length, 3).setValues(chunks);
  }
}

/**
 * โหลดสถานะระบบจากแท็บ "ข้อมูลระบบ" โดยรวม Chunk ทั้งหมดกลับคืนเป็น JSON
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

/**
 * หัวคอลัมน์ของแท็บ "ใบเสร็จรับเงิน"
 */
const RECEIPT_HEADERS = [
  "ลำดับ",
  "เล่มที่",
  "เลขที่",
  "วันที่ออก",
  "เวลา",
  "ชื่อผู้ชำระเงิน",
  "ประเภทผู้ชำระ",
  "สังกัด/หน่วยงาน (บรรทัด 1)",
  "ที่อยู่/จังหวัด (บรรทัด 2)",
  "รายการชำระ",
  "โครงการ",
  "จำนวนเงินรวม (บาท)",
  "วิธีชำระเงิน",
  "ธนาคารต้นทาง",
  "วันที่โอน",
  "เวลาโอน",
  "เข้าบัญชีมหาวิทยาลัย",
  "สถานะ",
  "เหตุผลยกเลิก",
  "ผู้ออกใบเสร็จ",
  "ตำแหน่งผู้ออก",
  "รหัสเจ้าหน้าที่",
  "วันที่บันทึกเข้าระบบ",
  "Receipt ID"
];

function initReceiptSheetHeaders(sheet) {
  sheet.getRange(1, 1, 1, RECEIPT_HEADERS.length).setValues([RECEIPT_HEADERS]);
  const headerRange = sheet.getRange(1, 1, 1, RECEIPT_HEADERS.length);
  headerRange.setBackground("#1e3a8a");
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  headerRange.setHorizontalAlignment("center");
  headerRange.setWrap(true);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 38);
}

function receiptToRow(r, index) {
  let itemName = "";
  let projectName = "";
  if (r.items && Array.isArray(r.items) && r.items.length > 0) {
    itemName = r.items.map(it => it.paymentItem || "").filter(Boolean).join(", ");
    projectName = r.items.map(it => it.projectName || "").filter(Boolean).join(", ");
  }

  return [
    index,
    r.bookNo || "",
    r.no || "",
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

/**
 * ซิงค์รายการใบเสร็จทั้งหมดลงชีต "ใบเสร็จรับเงิน" แบบเรียงตามเลขที่
 */
function syncReceiptsToSheet(receipts) {
  const sheet = getOrCreateSheet(SHEET_RECEIPTS);
  initReceiptSheetHeaders(sheet);

  if (!receipts || receipts.length === 0) return;

  // เรียงใบเสร็จตามวันที่และเลขที่
  const sorted = receipts.slice().sort((a, b) => {
    const bookCmp = String(a.bookNo || "").localeCompare(String(b.bookNo || ""));
    if (bookCmp !== 0) return bookCmp;
    return (Number(a.no) || 0) - (Number(b.no) || 0);
  });

  const rows = [];
  for (let i = 0; i < sorted.length; i++) {
    rows.push(receiptToRow(sorted[i], i + 1));
  }

  // ล้างเนื้อหาเดิม (ตั้งแต่แถวที่ 2)
  const maxClear = Math.max(sheet.getLastRow(), rows.length + 1);
  if (maxClear >= 2) {
    sheet.getRange(2, 1, maxClear, RECEIPT_HEADERS.length).clearContent();
  }

  // เขียนแถวใหม่ทั้งหมด
  sheet.getRange(2, 1, rows.length, RECEIPT_HEADERS.length).setValues(rows);

  // กำหนดรูปแบบตัวเลขเงินในคอลัมน์ 12 (จำนวนเงินรวม) เป็น #,##0.00
  sheet.getRange(2, 12, rows.length, 1).setNumberFormat("#,##0.00");
  
  // จัดกึ่งกลางคอลัมน์ ลำดับ, เล่มที่, เลขที่, วันที่, สถานะ
  sheet.getRange(2, 1, rows.length, 5).setHorizontalAlignment("center");
  sheet.getRange(2, 18, rows.length, 1).setHorizontalAlignment("center");
}

/**
 * เพิ่มแถวใบเสร็จใบใหม่ต่อท้ายทันที (สำหรับตอนกดออกใบเสร็จแบบ Real-time)
 */
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
