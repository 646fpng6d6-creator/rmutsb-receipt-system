/**
 * ============================================================================
 * การตั้งค่าการเชื่อมต่อฐานข้อมูลกลาง Supabase (supabase-config.js)
 * ระบบออกใบเสร็จรับเงิน มหาวิทยาลัยเทคโนโลยีราชมงคลสุวรรณภูมิ
 * ============================================================================
 *
 * ระบบจะลองเชื่อมต่อด้วยคีย์ทั้ง 2 รูปแบบโดยอัตโนมัติ:
 *   1. Publishable Key (รูปแบบใหม่ sb_publishable_...)
 *   2. Legacy JWT anon Key (รูปแบบเดิม eyJ...)
 * ทุกเครื่องจะใช้ฐานข้อมูลเดียวกันโดยไม่ต้องตั้งค่าใดๆ เพิ่มเติม
 */

const DEFAULT_SUPABASE_URL = "https://vuhihimohaheveiwfyyb.supabase.co";

// คีย์ Anon Key (Legacy JWT Key) ที่ตรวจสอบและยืนยันการเชื่อมต่อกับ Supabase แล้ว
const WORKING_SUPABASE_JWT_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1aGloaW1vaGFoZXZlaXdmeXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMjA3NTMsImV4cCI6MjEwNzc5Njc1M30.UH3sGkz2QXJBoaNRfFE3YkFA58DaVSm8WHH9TCXqlCg";

const SUPABASE_KEY_CANDIDATES = [
  WORKING_SUPABASE_JWT_KEY,
  "sb_publishable_k3Y5miInDeiBdVhYrnG4I3g_Uq_pHXJv",
  "sb_publishable_k3Y5miInDeiBdVhYrnG413g_Uq_pHXJv"
];

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
  let savedKey = getSaved("rmutsb_supabase_anon_key");
  // หากมีคีย์เดิมที่ขึ้นต้นด้วย sb_publishable_ หรือไม่มี ให้สลับมาใช้คีย์ JWT ที่ใช้งานได้จริงทันที
  if (!savedKey || savedKey.startsWith("sb_publishable_")) {
    savedKey = WORKING_SUPABASE_JWT_KEY;
    setSaved("rmutsb_supabase_anon_key", savedKey);
  }

  window.RMUTSB_SUPABASE_CONFIG = {
    url: savedUrl.trim(),
    anonKey: savedKey.trim(),
    keyCandidates: SUPABASE_KEY_CANDIDATES,
    pollingIntervalMs: 1500,
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
      this.anonKey = SUPABASE_KEY_CANDIDATES[0];
    },
    // จำคีย์ที่ใช้เชื่อมต่อสำเร็จไว้เพื่อใช้ครั้งต่อไป
    markWorkingKey: function (key) {
      if (key && key !== this.anonKey) {
        this.anonKey = key;
      }
      setSaved("rmutsb_supabase_anon_key", key);
    }
  };
})();
