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
  if (!u) return DEFAULT_SUPABASE_URL;
  const str = String(u).trim();
  // สกัดเอาเฉพาะ Origin เช่น https://qrjkcsadqinujtpnsdvi.supabase.co ตัด path /rest/v1 ทิ้งอัตโนมัติ
  const match = str.match(/https?:\/\/[a-z0-9_-]+\.supabase\.co/i);
  if (match) {
    // หากเป็นโปรเจกต์เดิมที่โควต้าเต็ม ให้สลับเป็นโปรเจกต์ใหม่
    if (match[0].includes("vuhihimohaheveiwfyyb")) {
      return DEFAULT_SUPABASE_URL;
    }
    return match[0];
  }
  return DEFAULT_SUPABASE_URL;
}

function cleanSupabaseKey(k) {
  if (!k) return DEFAULT_SUPABASE_ANON_KEY;
  const str = String(k).trim();
  if (str.includes("UH3sGkz2QXJBoaNRfFE3YkFA58DaVSm8WHH9TCXqlCg") || str.includes("k3Y5miInDeiBdVhYrnG4") || str.length < 20) {
    return DEFAULT_SUPABASE_ANON_KEY;
  }
  return str;
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
  let savedKey = cleanSupabaseKey(getSaved("rmutsb_supabase_anon_key"));

  // อัปเดต localStorage ด้วยค่าที่สะอาดและถูกต้องเสมอ
  setSaved("rmutsb_supabase_url", savedUrl);
  setSaved("rmutsb_supabase_anon_key", savedKey);

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
      const cleanKey = cleanSupabaseKey(newAnonKey);
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
      setSaved("rmutsb_supabase_url", DEFAULT_SUPABASE_URL);
      setSaved("rmutsb_supabase_anon_key", DEFAULT_SUPABASE_ANON_KEY);
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
