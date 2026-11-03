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

const DEFAULT_SUPABASE_URL = "https://qrjkcsadqinujtpnsdvi.supabase.co";

// คีย์ Anon Key สำหรับโปรเจกต์ใหม่ (โควต้าเต็ม 5 GB ใหม่)
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_mBEYicRTTxEo0JNlf3TLFg_1w7he-Gw";

const SUPABASE_KEY_CANDIDATES = [
  DEFAULT_SUPABASE_ANON_KEY
];

function cleanSupabaseUrl(u) {
  if (!u) return "";
  return u.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
}

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

  let savedUrl = cleanSupabaseUrl(getSaved("rmutsb_supabase_url"));
  let savedKey = (getSaved("rmutsb_supabase_anon_key") || "").trim();

  // หากเป็น URL หรือ Key ของโปรเจกต์เดิมที่โควต้าเต็ม (vuhihimohaheveiwfyyb) หรือยังไม่มี ให้อัปเกรดเป็นโปรเจกต์ใหม่ทันที
  if (!savedUrl || savedUrl.includes("vuhihimohaheveiwfyyb") || !savedKey || savedKey.includes("UH3sGkz2QXJBoaNRfFE3YkFA58DaVSm8WHH9TCXqlCg") || savedKey.includes("k3Y5miInDeiBdVhYrnG4")) {
    savedUrl = DEFAULT_SUPABASE_URL;
    savedKey = DEFAULT_SUPABASE_ANON_KEY;
    setSaved("rmutsb_supabase_url", savedUrl);
    setSaved("rmutsb_supabase_anon_key", savedKey);
  }

  window.RMUTSB_SUPABASE_CONFIG = {
    url: cleanSupabaseUrl(savedUrl),
    anonKey: savedKey.trim(),
    keyCandidates: SUPABASE_KEY_CANDIDATES,
    pollingIntervalMs: 15000,
    isConfigured: function () {
      return Boolean(this.url && this.anonKey && this.url.startsWith("http"));
    },
    saveConfig: function (newUrl, newAnonKey) {
      const cleanUrl = cleanSupabaseUrl(newUrl);
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
