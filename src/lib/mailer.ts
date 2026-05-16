import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_USER } from "./config";

let _t: Transporter | null = null;

function transport(): Transporter {
  if (!_t) {
    _t = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return _t;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  await transport().sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    // Some SMTP servers require MAIL FROM to match the authenticated user;
    // the display-name From: header can differ from the envelope sender.
    envelope: { from: SMTP_USER, to: opts.to },
  });
}
