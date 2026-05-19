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

export function getIntegrationStatus() {
  const statuses = Object.keys(PROVIDERS).map((providerName) => {
    const config = providerConfig(providerName);
    return {
      provider: providerName,
      configured: config.configured,
      urlEnv: PROVIDERS[providerName].urlEnv,
      tokenEnv: PROVIDERS[providerName].tokenEnv,
    };
  });
  statuses.push({
    provider: "resend",
    configured: !!process.env.RESEND_API_KEY,
    urlEnv: "RESEND_API_KEY",
    tokenEnv: "RESEND_API_KEY",
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
  return postWebhook("fileStorage", { fileName, mimeType, base64, metadata });
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
