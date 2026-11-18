import { errorMessage } from "@/lib/http-error";
import { clientIp, rateLimitPublicApi } from "@/lib/public-api-guard";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const DEFAULT_TO = "menu@altatab.com";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanField(value: unknown, max = 200) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function accessRequestHtml(input: {
  name: string;
  email: string;
  restaurant: string;
  note: string;
  ip: string;
}) {
  const noteBlock = input.note
    ? `<p style="margin:16px 0 0;"><b>Notes</b><br/>${escapeHtml(input.note)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f1b16;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#6d0808;">
                  Altatab access request
                </p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">
                  New membership inquiry
                </h1>
                <p style="margin:0 0 8px;"><b>Name:</b> ${escapeHtml(input.name)}</p>
                <p style="margin:0 0 8px;"><b>Email:</b> ${escapeHtml(input.email)}</p>
                <p style="margin:0 0 8px;"><b>Restaurant / group:</b> ${escapeHtml(input.restaurant)}</p>
                ${noteBlock}
                <p style="margin:20px 0 0;font-size:12px;color:#757d6f;">
                  IP: ${escapeHtml(input.ip)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function POST(request: Request) {
  const limited = rateLimitPublicApi(request, "access-request", "public", 8);
  if (!limited.ok) return limited.response;

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      restaurant?: string;
      note?: string;
    };

    const name = cleanField(body.name, 120);
    const email = cleanField(body.email, 160).toLowerCase();
    const restaurant = cleanField(body.restaurant, 160);
    const note = cleanField(body.note, 2000);

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
    }
    if (!restaurant || restaurant.length < 2) {
      return NextResponse.json(
        { error: "Enter your restaurant or group name." },
        { status: 400 },
      );
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not set on the server." },
        { status: 500 },
      );
    }

    const toEmail =
      process.env.ACCESS_REQUEST_TO_EMAIL?.trim() || DEFAULT_TO;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL?.trim() || "Altatab <onboarding@resend.dev>";

    const resend = new Resend(apiKey);
    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `Access request: ${restaurant}`,
      html: accessRequestHtml({
        name,
        email,
        restaurant,
        note,
        ip: clientIp(request),
      }),
    });

    if (emailError) {
      throw emailError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Access request email error:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
