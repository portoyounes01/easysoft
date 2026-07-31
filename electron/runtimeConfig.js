// Runtime-config layer (update-policy §10 Stage 0; multi-tenant-plan §9.2 / S22).
// Reads userData/config.json at startup so a till can be retargeted (environment,
// Supabase project, UI origin, renderer source) by editing one file — no reinstall.
//
// Fail-loud contract: a MISSING config.json is fine (defaults, till behaves exactly
// as before this layer existed); an INVALID one is collected into `issues` and the
// boot gate turns those into a blocking red precondition — a till with a broken
// config must not silently sell against the wrong environment (P3/P5).
const fs = require('fs');
const path = require('path');

const RENDERER_SOURCES = ['bundled', 'network'];

function isPrivateHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  );
}

// Returns the normalized origin string, or null (pushing a reason into issues).
function validateOrigin(value, field, issues) {
  const url = validateHttpUrl(value, field, issues);
  return url ? url.origin : null;
}

// Full-URL variant (path allowed — update feeds live under a path).
function validateHttpUrl(value, field, issues) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    issues.push(`${field} is not a valid URL: ${JSON.stringify(value)}`);
    return null;
  }
  const httpsOk = url.protocol === 'https:';
  const devHttpOk = url.protocol === 'http:' && isPrivateHost(url.hostname);
  if (!httpsOk && !devHttpOk) {
    issues.push(`${field} must be https:// (http:// is allowed only for localhost/LAN hosts): ${value}`);
    return null;
  }
  return url;
}

function loadRuntimeConfig(options = {}) {
  const userDataPath = options.userDataPath;
  const filePath = path.join(userDataPath, 'config.json');
  const issues = [];
  let raw = null;
  let exists = false;

  try {
    if (fs.existsSync(filePath)) {
      exists = true;
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        issues.push('config.json must contain a JSON object');
        raw = null;
      }
    }
  } catch (error) {
    issues.push(`config.json is unreadable or not valid JSON: ${error.message}`);
    raw = null;
  }
  raw = raw || {};

  const config = {
    filePath,
    exists,
    issues,
    environment: null,
    supabaseUrl: null,
    supabaseAnonKey: null,
    uiOrigin: null,
    rendererSource: 'bundled',
    updateFeedUrl: null,
  };

  if (raw.environment != null) {
    config.environment = String(raw.environment);
  }

  if (raw.supabase_url != null) {
    config.supabaseUrl = validateOrigin(raw.supabase_url, 'supabase_url', issues);
  }
  if (raw.supabase_anon_key != null) {
    if (typeof raw.supabase_anon_key === 'string' && raw.supabase_anon_key.trim()) {
      config.supabaseAnonKey = raw.supabase_anon_key.trim();
    } else {
      issues.push('supabase_anon_key must be a non-empty string');
    }
  }
  // The pair travels together: a URL pointing at project A with a key baked for
  // project B is a subtle mis-target — refuse halves.
  if (Boolean(config.supabaseUrl) !== Boolean(config.supabaseAnonKey)) {
    issues.push('supabase_url and supabase_anon_key must be set together (or neither)');
    config.supabaseUrl = null;
    config.supabaseAnonKey = null;
  }

  if (raw.ui_origin != null) {
    config.uiOrigin = validateOrigin(raw.ui_origin, 'ui_origin', issues);
  }

  if (raw.update_feed_url != null) {
    const feed = validateHttpUrl(raw.update_feed_url, 'update_feed_url', issues);
    const loopback = feed && ['localhost', '127.0.0.1', '[::1]'].includes(feed.hostname);
    if (feed && feed.protocol !== 'https:' && !loopback) {
      // The feed delivers EXECUTABLES to an unsigned install — https strictly.
      // No LAN-http exception (that one exists only for UI pilots); loopback
      // is allowed because it cannot be intercepted and is how the local
      // two-version e2e test runs (runbook §G).
      issues.push(`update_feed_url must be https:// (executables travel over it; http is allowed only on loopback): ${raw.update_feed_url}`);
      config.updateFeedUrl = null;
    } else {
      config.updateFeedUrl = feed ? feed.href : null;
    }
  }

  if (raw.renderer_source != null) {
    const source = String(raw.renderer_source);
    if (!RENDERER_SOURCES.includes(source)) {
      issues.push(`renderer_source must be one of ${RENDERER_SOURCES.join('|')}: ${JSON.stringify(raw.renderer_source)}`);
    } else if (source === 'network' && !config.uiOrigin) {
      issues.push("renderer_source 'network' requires a valid ui_origin");
    } else {
      config.rendererSource = source;
    }
  }

  return config;
}

module.exports = { loadRuntimeConfig };
