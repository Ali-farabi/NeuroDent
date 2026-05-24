import { createClient } from "@supabase/supabase-js";

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
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEURODENT_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || process.env.NEURODENT_SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEURODENT_SUPABASE_SECRET_KEY
    || "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || process.env.NEURODENT_SUPABASE_STORAGE_BUCKET || "neurodent-files";
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

const supabaseClientCache = new Map();
const supabaseBucketReady = new Map();

function supabaseClient(config) {
  const cacheKey = `${config.url}:${config.serviceKey.slice(0, 8)}`;
  if (!supabaseClientCache.has(cacheKey)) {
    supabaseClientCache.set(cacheKey, createClient(config.url, config.serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }));
  }
  return supabaseClientCache.get(cacheKey);
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
  const { data } = supabaseClient(config).storage.from(config.bucket).getPublicUrl(objectPath);
  return data?.publicUrl || `${config.url}/storage/v1/object/public/${storagePathSegment(config.bucket)}/${storagePathSegment(objectPath)}`;
}

function storageErrorMessage(error) {
  return String(error?.message || error?.error || error?.statusCode || "storage_request_failed");
}

async function ensureSupabaseBucket(config) {
  const cacheKey = `${config.url}:${config.bucket}:${config.isPublic}`;
  if (supabaseBucketReady.get(cacheKey)) {
    return { ok: true, status: "ready", bucket: config.bucket };
  }

  const client = supabaseClient(config);
  const existing = await client.storage.getBucket(config.bucket);
  if (!existing.error) {
    supabaseBucketReady.set(cacheKey, true);
    return { ok: true, status: "ready", bucket: config.bucket };
  }

  const statusCode = String(existing.error?.statusCode || existing.error?.status || "");
  const message = storageErrorMessage(existing.error).toLowerCase();
  const missing = statusCode === "404" || message.includes("not found") || message.includes("does not exist");
  if (!missing) {
    return {
      ok: false,
      status: "failed",
      bucket: config.bucket,
      error: storageErrorMessage(existing.error),
    };
  }

  const created = await client.storage.createBucket(config.bucket, {
    public: config.isPublic,
  });
  if (created.error) {
    const createMessage = storageErrorMessage(created.error);
    if (!createMessage.toLowerCase().includes("already exists")) {
      return {
        ok: false,
        status: "failed",
        bucket: config.bucket,
        error: createMessage,
      };
    }
  }

  supabaseBucketReady.set(cacheKey, true);
  return { ok: true, status: "created", bucket: config.bucket };
}

async function uploadSupabaseFile({ fileName, mimeType, base64, metadata = {} }) {
  const config = supabaseStorageConfig();
  if (!config.configured) return null;

  const cleanBase64 = String(base64 || "").includes(",") ? String(base64).split(",").pop() : String(base64 || "");
  const bytes = Buffer.from(cleanBase64, "base64");
  const objectPath = [config.prefix, buildStorageObjectPath(fileName, metadata)].filter(Boolean).join("/");
  const bucket = await ensureSupabaseBucket(config);
  if (!bucket.ok) {
    return {
      ok: false,
      provider: "supabaseStorage",
      status: "failed",
      error: bucket.error,
      bucket: config.bucket,
      path: objectPath,
    };
  }

  try {
    const { data, error } = await supabaseClient(config).storage.from(config.bucket).upload(objectPath, bytes, {
      cacheControl: "3600",
      contentType: mimeType || "application/octet-stream",
      upsert: false,
      metadata: Object.fromEntries(
        Object.entries(metadata || {})
          .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
          .map(([key, value]) => [key, String(value)]),
      ),
    });
    if (error) {
      return {
        ok: false,
        provider: "supabaseStorage",
        status: "failed",
        error: storageErrorMessage(error),
        bucket: config.bucket,
        path: objectPath,
      };
    }
    return {
      ok: true,
      provider: "supabaseStorage",
      status: "uploaded",
      statusCode: 200,
      bucket: config.bucket,
      path: objectPath,
      publicUrl: publicSupabaseObjectUrl(config, objectPath),
      id: data?.id || "",
      key: data?.path || data?.fullPath || "",
      error: "",
    };
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
  try {
    const { data, error } = await supabaseClient(config).storage.from(cloudStorage.bucket).download(cloudStorage.path);
    if (error) {
      return { ok: false, provider, status: "failed", error: storageErrorMessage(error) };
    }
    return {
      ok: true,
      provider,
      status: "downloaded",
      bytes: Buffer.from(await data.arrayBuffer()),
      mimeType: data.type || "",
    };
  } catch (err) {
    return { ok: false, provider, status: "failed", error: err?.message || "request_failed" };
  }
}

async function deleteSupabaseFile(cloudStorage = {}) {
  const config = supabaseStorageConfig();
  if (!config.configured || !cloudStorage?.bucket || !cloudStorage?.path) return null;
  try {
    const { error } = await supabaseClient(config).storage.from(cloudStorage.bucket).remove([cloudStorage.path]);
    return {
      ok: !error,
      provider: "supabaseStorage",
      status: error ? "failed" : "deleted",
      statusCode: error ? 500 : 200,
      bucket: cloudStorage.bucket,
      path: cloudStorage.path,
      error: error ? storageErrorMessage(error) : "",
    };
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
}

export async function checkSupabaseStorage() {
  const config = supabaseStorageConfig();
  const status = {
    configured: config.configured,
    source: {
      url: config.url ? "configured" : "",
      serviceKey: config.serviceKey ? "configured" : "",
      bucket: config.bucket,
      prefix: config.prefix,
      public: config.isPublic,
    },
    reachable: false,
    bucketReady: false,
    provider: "supabaseStorage",
    error: null,
  };

  if (!config.configured) {
    return {
      ...status,
      missingRequiredEnv: [
        ...(!config.url ? ["SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL"] : []),
        ...(!config.serviceKey ? ["SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY"] : []),
        ...(!config.bucket ? ["SUPABASE_STORAGE_BUCKET"] : []),
      ],
    };
  }

  const bucket = await ensureSupabaseBucket(config);
  if (!bucket.ok) {
    return {
      ...status,
      reachable: true,
      error: bucket.error,
    };
  }

  return {
    ...status,
    reachable: true,
    bucketReady: true,
    bucketStatus: bucket.status,
    missingRequiredEnv: [],
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
  const storageRequired = [
    { name: "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL", configured: !!storageConfig.url },
    { name: "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY", configured: !!storageConfig.serviceKey },
    { name: "SUPABASE_STORAGE_BUCKET", configured: !!storageConfig.bucket },
  ];
  const storageOptional = ["SUPABASE_STORAGE_PREFIX", "SUPABASE_STORAGE_PUBLIC"];
  statuses.push({
    provider: "supabaseStorage",
    configured: storageConfig.configured,
    status: storageConfig.configured ? "configured" : "skipped",
    urlEnv: "SUPABASE_URL",
    tokenEnv: "SUPABASE_SERVICE_ROLE_KEY",
    bucketEnv: "SUPABASE_STORAGE_BUCKET",
    requiredEnv: storageRequired,
    optionalEnv: envPresence(storageOptional),
    missingRequiredEnv: storageRequired.filter((item) => !item.configured).map((item) => item.name),
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
