const PROVIDERS = {
  email: {
    name: "email",
    urlEnv: "NEURODENT_EMAIL_WEBHOOK_URL",
    tokenEnv: "NEURODENT_EMAIL_WEBHOOK_TOKEN",
  },
  sms: {
    name: "sms",
    urlEnv: "NEURODENT_SMS_WEBHOOK_URL",
    tokenEnv: "NEURODENT_SMS_WEBHOOK_TOKEN",
  },
  whatsapp: {
    name: "whatsapp",
    urlEnv: "NEURODENT_WHATSAPP_WEBHOOK_URL",
    tokenEnv: "NEURODENT_WHATSAPP_WEBHOOK_TOKEN",
  },
  fileStorage: {
    name: "fileStorage",
    urlEnv: "NEURODENT_FILE_STORAGE_WEBHOOK_URL",
    tokenEnv: "NEURODENT_FILE_STORAGE_WEBHOOK_TOKEN",
  },
  fiscalization: {
    name: "fiscalization",
    urlEnv: "NEURODENT_FISCALIZATION_WEBHOOK_URL",
    tokenEnv: "NEURODENT_FISCALIZATION_WEBHOOK_TOKEN",
  },
  eSignature: {
    name: "eSignature",
    urlEnv: "NEURODENT_ESIGN_WEBHOOK_URL",
    tokenEnv: "NEURODENT_ESIGN_WEBHOOK_TOKEN",
  },
  ai: {
    name: "ai",
    urlEnv: "NEURODENT_AI_WEBHOOK_URL",
    tokenEnv: "NEURODENT_AI_WEBHOOK_TOKEN",
  },
};

function providerConfig(providerName) {
  const provider = PROVIDERS[providerName];
  const url = process.env[provider.urlEnv] || "";
  const token = process.env[provider.tokenEnv] || "";
  return {
    provider: provider.name,
    configured: !!url,
    url,
    token,
  };
}

function envPresence(names = []) {
  return names.map((name) => ({
    name,
    configured: !!process.env[name],
  }));
}

function missingEnv(names = []) {
  return names.filter((name) => !process.env[name]);
}

async function sendResendEmail({ to, subject, text, html, metadata = {} }) {
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) return null;

  const from = process.env.EMAIL_FROM || "NeuroDent <onboarding@resend.dev>";
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        text,
        html: html || `<p>${String(text || "").replace(/\n/g, "<br>")}</p>`,
        headers: {
          "X-NeuroDent-Source": "backend",
        },
        tags: Object.entries(metadata || {})
          .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
          .slice(0, 10)
          .map(([name, value]) => ({ name: String(name).slice(0, 40), value: String(value).slice(0, 256) })),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return {
      ok: false,
      provider: "resend",
      status: "failed",
      error: err?.message || "request_failed",
    };
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    provider: "resend",
    status: response.ok ? "sent" : "failed",
    statusCode: response.status,
    id: data?.id || "",
    error: data?.message || data?.error || "",
  };
}

async function postWebhook(providerName, payload) {
  const config = providerConfig(providerName);
  if (!config.configured) {
    return {
      ok: true,
      provider: providerName,
      status: "skipped",
      reason: "not_configured",
    };
  }

  let response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return {
      ok: false,
      provider: providerName,
      status: "failed",
      error: err?.message || "request_failed",
    };
  }

  return {
    ok: response.ok,
    provider: providerName,
    status: response.ok ? "sent" : "failed",
    statusCode: response.status,
  };
}

function normalizeSupabaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function storagePathSegment(value) {
  return encodeURIComponent(String(value || "").trim()).replace(/%2F/gi, "/");
}

function safeStorageFileName(name, fallback = "file.bin") {
  const raw = String(name || fallback).trim() || fallback;
  return raw.replace(/[<>:"\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, "_").slice(0, 140);
}

function supabaseStorageConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEURODENT_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEURODENT_SUPABASE_SERVICE_ROLE_KEY || "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.NEURODENT_SUPABASE_STORAGE_BUCKET || "";
  const prefix = String(process.env.SUPABASE_STORAGE_PREFIX || process.env.NEURODENT_SUPABASE_STORAGE_PREFIX || "neurodent").replace(/^\/+|\/+$/g, "");
  const isPublic = String(process.env.SUPABASE_STORAGE_PUBLIC || process.env.NEURODENT_SUPABASE_STORAGE_PUBLIC || "").toLowerCase() === "true";
  return {
    provider: "supabaseStorage",
    configured: !!(url && serviceKey && bucket),
    url,
    serviceKey,
    bucket,
    prefix,
    isPublic,
  };
}

function supabaseHeaders(config, extra = {}) {
  return {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    ...extra,
  };
}

function buildStorageObjectPath(fileName, metadata = {}) {
  const patientId = String(metadata.patientId || "").trim();
  const visitId = String(metadata.visitId || "").trim();
  const fileId = String(metadata.fileId || Date.now()).trim();
  const kind = safeStorageFileName(metadata.kind || "upload", "upload");
  const folder = patientId ? `patients/${patientId}` : visitId ? `visits/${visitId}` : "general";
  return [kind, folder, `${fileId}_${safeStorageFileName(fileName)}`].join("/");
}

function publicSupabaseObjectUrl(config, objectPath) {
  if (!config.isPublic) return "";
  return `${config.url}/storage/v1/object/public/${storagePathSegment(config.bucket)}/${storagePathSegment(objectPath)}`;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    try {
      return { text: await response.text() };
    } catch {
      return null;
    }
  }
}

async function uploadSupabaseFile({ fileName, mimeType, base64, metadata = {} }) {
  const config = supabaseStorageConfig();
  if (!config.configured) return null;

  const cleanBase64 = String(base64 || "").includes(",") ? String(base64).split(",").pop() : String(base64 || "");
  const bytes = Buffer.from(cleanBase64, "base64");
  const objectPath = [config.prefix, buildStorageObjectPath(fileName, metadata)].filter(Boolean).join("/");
  const endpoint = `${config.url}/storage/v1/object/${storagePathSegment(config.bucket)}/${storagePathSegment(objectPath)}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: supabaseHeaders(config, {
        "Content-Type": mimeType || "application/octet-stream",
        "cache-control": "3600",
        "x-upsert": "false",
      }),
      body: bytes,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return {
      ok: false,
      provider: "supabaseStorage",
      status: "failed",
      error: err?.message || "request_failed",
      bucket: config.bucket,
      path: objectPath,
    };
  }

  const data = await parseJsonResponse(response);
  return {
    ok: response.ok,
    provider: "supabaseStorage",
    status: response.ok ? "uploaded" : "failed",
    statusCode: response.status,
    bucket: config.bucket,
    path: objectPath,
    publicUrl: publicSupabaseObjectUrl(config, objectPath),
    id: data?.Id || data?.id || "",
    key: data?.Key || data?.key || "",
    error: data?.message || data?.error || data?.text || "",
  };
}

export async function downloadExternalFile(cloudStorage = {}) {
  const provider = cloudStorage?.provider || "";
  if (provider !== "supabaseStorage" || !cloudStorage?.bucket || !cloudStorage?.path) {
    return { ok: false, provider: provider || "externalStorage", status: "skipped", reason: "not_supported" };
  }
  const config = supabaseStorageConfig();
  if (!config.configured) {
    return { ok: false, provider, status: "skipped", reason: "not_configured" };
  }
  const endpoint = `${config.url}/storage/v1/object/${storagePathSegment(cloudStorage.bucket)}/${storagePathSegment(cloudStorage.path)}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: supabaseHeaders(config),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return { ok: false, provider, status: "failed", error: err?.message || "request_failed" };
  }
  if (!response.ok) {
    const data = await parseJsonResponse(response);
    return { ok: false, provider, status: "failed", statusCode: response.status, error: data?.message || data?.error || data?.text || "" };
  }
  return {
    ok: true,
    provider,
    status: "downloaded",
    bytes: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "",
  };
}

async function deleteSupabaseFile(cloudStorage = {}) {
  const config = supabaseStorageConfig();
  if (!config.configured || !cloudStorage?.bucket || !cloudStorage?.path) return null;
  let response;
  try {
    response = await fetch(`${config.url}/storage/v1/object/${storagePathSegment(cloudStorage.bucket)}`, {
      method: "DELETE",
      headers: supabaseHeaders(config, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [cloudStorage.path] }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    return {
      ok: false,
      provider: "supabaseStorage",
      status: "failed",
      error: err?.message || "request_failed",
      bucket: cloudStorage.bucket,
      path: cloudStorage.path,
    };
  }
  const data = await parseJsonResponse(response);
  return {
    ok: response.ok,
    provider: "supabaseStorage",
    status: response.ok ? "deleted" : "failed",
    statusCode: response.status,
    bucket: cloudStorage.bucket,
    path: cloudStorage.path,
    error: data?.message || data?.error || data?.text || "",
  };
}

export function getIntegrationStatus() {
  const statuses = Object.keys(PROVIDERS).map((providerName) => {
    const config = providerConfig(providerName);
    const requiredEnv = [PROVIDERS[providerName].urlEnv];
    const optionalEnv = [PROVIDERS[providerName].tokenEnv];
    return {
      provider: providerName,
      configured: config.configured,
      status: config.configured ? "configured" : "skipped",
      urlEnv: PROVIDERS[providerName].urlEnv,
      tokenEnv: PROVIDERS[providerName].tokenEnv,
      requiredEnv: envPresence(requiredEnv),
      optionalEnv: envPresence(optionalEnv),
      missingRequiredEnv: missingEnv(requiredEnv),
    };
  });
  const resendRequired = ["RESEND_API_KEY"];
  const resendOptional = ["EMAIL_FROM"];
  statuses.push({
    provider: "resend",
    configured: !!process.env.RESEND_API_KEY,
    status: process.env.RESEND_API_KEY ? "configured" : "skipped",
    urlEnv: "RESEND_API_KEY",
    tokenEnv: "RESEND_API_KEY",
    requiredEnv: envPresence(resendRequired),
    optionalEnv: envPresence(resendOptional),
    missingRequiredEnv: missingEnv(resendRequired),
  });
  const storageConfig = supabaseStorageConfig();
  const storageRequired = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"];
  const storageOptional = ["SUPABASE_STORAGE_PREFIX", "SUPABASE_STORAGE_PUBLIC"];
  statuses.push({
    provider: "supabaseStorage",
    configured: storageConfig.configured,
    status: storageConfig.configured ? "configured" : "skipped",
    urlEnv: "SUPABASE_URL",
    tokenEnv: "SUPABASE_SERVICE_ROLE_KEY",
    bucketEnv: "SUPABASE_STORAGE_BUCKET",
    requiredEnv: envPresence(storageRequired),
    optionalEnv: envPresence(storageOptional),
    missingRequiredEnv: missingEnv(storageRequired),
  });
  return statuses;
}

export async function sendEmail({ to, subject, text, html, metadata = {} }) {
  const resendResult = await sendResendEmail({ to, subject, text, html, metadata });
  if (resendResult) return resendResult;
  return postWebhook("email", { to, subject, text, html, metadata });
}

export async function sendSms({ to, message, metadata = {} }) {
  return postWebhook("sms", { to, message, metadata });
}

export async function sendWhatsApp({ to, message, metadata = {} }) {
  return postWebhook("whatsapp", { to, message, metadata });
}

export async function uploadExternalFile({ fileName, mimeType, base64, metadata = {} }) {
  const supabaseResult = await uploadSupabaseFile({ fileName, mimeType, base64, metadata });
  if (supabaseResult) return supabaseResult;
  return postWebhook("fileStorage", { fileName, mimeType, base64, metadata });
}

export async function deleteExternalFile(cloudStorage = {}) {
  const supabaseResult = await deleteSupabaseFile(cloudStorage);
  if (supabaseResult) return supabaseResult;
  return { ok: true, provider: "externalStorage", status: "skipped", reason: "not_configured" };
}

export async function sendFiscalReceipt({ payment, patient, metadata = {} }) {
  return postWebhook("fiscalization", { payment, patient, metadata });
}

export async function requestESignature({ file, signer, metadata = {} }) {
  return postWebhook("eSignature", { file, signer, metadata });
}

export async function requestExternalAi({ task, input, metadata = {} }) {
  return postWebhook("ai", { task, input, metadata });
}
