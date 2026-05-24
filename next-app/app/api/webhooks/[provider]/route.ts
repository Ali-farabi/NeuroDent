import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const PROVIDER_ALIASES: Record<string, string> = {
  email: "email",
  sms: "sms",
  whatsapp: "whatsapp",
  fileStorage: "fileStorage",
  "file-storage": "fileStorage",
  fiscalization: "fiscalization",
  eSignature: "eSignature",
  esign: "eSignature",
  ai: "ai",
};

function getExpectedToken(provider: string) {
  const tokens: Record<string, string | undefined> = {
    email: process.env.NEURODENT_EMAIL_WEBHOOK_TOKEN,
    sms: process.env.NEURODENT_SMS_WEBHOOK_TOKEN,
    whatsapp: process.env.NEURODENT_WHATSAPP_WEBHOOK_TOKEN,
    fileStorage: process.env.NEURODENT_FILE_STORAGE_WEBHOOK_TOKEN,
    fiscalization: process.env.NEURODENT_FISCALIZATION_WEBHOOK_TOKEN,
    eSignature: process.env.NEURODENT_ESIGN_WEBHOOK_TOKEN,
    ai: process.env.NEURODENT_AI_WEBHOOK_TOKEN,
  };

  return tokens[provider];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const params = await context.params;
  const rawProvider = params.provider;
  const provider = PROVIDER_ALIASES[rawProvider];

  if (!provider) {
    return NextResponse.json(
      {
        ok: false,
        status: "failed",
        error: "unknown_provider",
      },
      { status: 404 }
    );
  }

  const expectedToken = getExpectedToken(provider);
  const authHeader = request.headers.get("authorization") || "";

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      {
        ok: false,
        provider,
        status: "failed",
        error: "unauthorized",
      },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));

  if (body?.type === "health_check" || body?.event === "health_check" || body?.dryRun === true) {
    return NextResponse.json({
      ok: true,
      provider,
      status: "ready",
      checked: true,
      dryRun: true,
      requestId: `health_${provider}_${Date.now()}`,
    });
  }

  return NextResponse.json({
    ok: true,
    provider,
    status: "received",
    requestId: `${provider}_${Date.now()}`,
  });
}