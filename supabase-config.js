/**
 * ============================================================================
 * การตั้งค่าการเชื่อมต่อฐานข้อมูลกลาง Supabase (supabase-config.js)
 * ระบบออกใบเสร็จรับเงิน มหาวิทยาลัยเทคโนโลยีราชมงคลสุวรรณภูมิ
 * ============================================================================
 *
 * วิธีตั้งค่าเพื่อใช้งานจริงบนเว็บไซต์ / GitHub Pages:
 * 1. นำค่า Project URL และ anon public key จาก Supabase Dashboard
 *    (เมนู Project Settings -> API) มาใส่ในตัวแปร DEFAULT_SUPABASE_URL และ DEFAULT_SUPABASE_ANON_KEY ด้านล่าง
 * 2. หรือตั้งค่าผ่านปุ่ม "ตั้งค่าฐานข้อมูล Supabase" บนหน้าเว็บไซต์โดยตรง
 */

const DEFAULT_SUPABASE_URL = ""; // ตัวอย่าง: "https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
const DEFAULT_SUPABASE_ANON_KEY = ""; // ตัวอย่าง: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

(function initRMUTSBSupabaseConfig() {
  function getSaved(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function setSaved(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function removeSaved(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }

  const savedUrl = getSaved("rmutsb_supabase_url") || DEFAULT_SUPABASE_URL;
  const savedKey = getSaved("rmutsb_supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY;

  window.RMUTSB_SUPABASE_CONFIG = {
    url: savedUrl.trim(),
    anonKey: savedKey.trim(),
    pollingIntervalMs: 3000, // ดึงข้อมูลอัปเดตอัตโนมัติทุก 3 วินาทีควบคู่กับ Supabase Realtime
    isConfigured: function () {
      return Boolean(this.url && this.anonKey && this.url.startsWith("http"));
    },
    saveConfig: function (newUrl, newAnonKey) {
      const cleanUrl = (newUrl || "").trim().replace(/\/+$/, "");
      const cleanKey = (newAnonKey || "").trim();
      setSaved("rmutsb_supabase_url", cleanUrl);
      setSaved("rmutsb_supabase_anon_key", cleanKey);
      this.url = cleanUrl;
      this.anonKey = cleanKey;
    },
    clearConfig: function () {
      removeSaved("rmutsb_supabase_url");
      removeSaved("rmutsb_supabase_anon_key");
      this.url = DEFAULT_SUPABASE_URL;
      this.anonKey = DEFAULT_SUPABASE_ANON_KEY;
    }
  };
})();
