/**
 * ============================================================================
 * การตั้งค่าการเชื่อมต่อฐานข้อมูลส่วนกลาง (supabase-config.js)
 * รองรับทั้ง Google Sheets Web App และ Supabase Cloud
 * ระบบออกใบเสร็จรับเงิน มหาวิทยาลัยเทคโนโลยีราชมงคลสุวรรณภูมิ
 * ============================================================================
 */

const DEFAULT_SUPABASE_URL = "https://qrjkcsadqinujtpnsdvi.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_mBEYicRTTxEo0JNlf3TLFg_1w7he-Gw";
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwJ7OsSMtAeSY_NTSyF3157yMq4IF3hA2w16lkRZMDQruWVLa88k03DmqPS31SHUWGpMA/exec";

const SUPABASE_KEY_CANDIDATES = [
  DEFAULT_SUPABASE_ANON_KEY
];

function cleanSupabaseUrl(u) {
  if (!u) return DEFAULT_SUPABASE_URL;
  const str = String(u).trim();
  const match = str.match(/https?:\/\/[a-z0-9_-]+\.supabase\.co/i);
  if (match) {
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

function cleanGasUrl(u) {
  if (!u) return "";
  const str = String(u).trim();
  // สกัด URL ที่ถูกต้องของ Google Apps Script exec
  const match = str.match(/https?:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_\-]+\/exec/i);
  if (match) return match[0];
  if (str.startsWith("https://script.google.com/")) return str.replace(/\/?(\?.*)?$/, "");
  return str;
}

(function initRMUTSBUnifiedDbConfig() {
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
  let savedGasUrl = cleanGasUrl(getSaved("rmutsb_gas_url") || DEFAULT_GAS_URL);
  let activeProvider = getSaved("rmutsb_active_db_provider") || (savedGasUrl ? "googlesheet" : "supabase");

  setSaved("rmutsb_supabase_url", savedUrl);
  setSaved("rmutsb_supabase_anon_key", savedKey);
  if (savedGasUrl) setSaved("rmutsb_gas_url", savedGasUrl);
  setSaved("rmutsb_active_db_provider", activeProvider);

  window.RMUTSB_DATABASE_CONFIG = {
    activeProvider: activeProvider, // "googlesheet" | "supabase" | "fallback"
    gasUrl: savedGasUrl,
    supabaseUrl: savedUrl,
    supabaseAnonKey: savedKey,
    pollingIntervalMs: 15000,
    
    getGasUrl: function() {
      return cleanGasUrl(getSaved("rmutsb_gas_url") || this.gasUrl);
    },
    saveGasUrl: function(url) {
      const clean = cleanGasUrl(url);
      setSaved("rmutsb_gas_url", clean);
      this.gasUrl = clean;
      this.setActiveProvider("googlesheet");
    },
    getActiveProvider: function() {
      return getSaved("rmutsb_active_db_provider") || this.activeProvider || "supabase";
    },
    setActiveProvider: function(provider) {
      setSaved("rmutsb_active_db_provider", provider);
      this.activeProvider = provider;
    }
  };

  // รักษาความเข้ากันได้ย้อนหลัง (Backward Compatibility) กับตัวแปรเดิม
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
      window.RMUTSB_DATABASE_CONFIG.supabaseUrl = cleanUrl;
      window.RMUTSB_DATABASE_CONFIG.supabaseAnonKey = cleanKey;
      window.RMUTSB_DATABASE_CONFIG.setActiveProvider("supabase");
    },
    clearConfig: function () {
      removeSaved("rmutsb_supabase_url");
      removeSaved("rmutsb_supabase_anon_key");
      this.url = DEFAULT_SUPABASE_URL;
      this.anonKey = DEFAULT_SUPABASE_ANON_KEY;
      setSaved("rmutsb_supabase_url", DEFAULT_SUPABASE_URL);
      setSaved("rmutsb_supabase_anon_key", DEFAULT_SUPABASE_ANON_KEY);
    },
    markWorkingKey: function (key) {
      if (key && key !== this.anonKey) {
        this.anonKey = key;
      }
      setSaved("rmutsb_supabase_anon_key", key);
    }
  };
})();
