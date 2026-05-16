import { SHOP_CONTACT_EMAIL, SHOP_NAME, SHOP_PUBLIC_URL } from "./config";

const SHOP_URL = SHOP_PUBLIC_URL;
const CONTACT_EMAIL = SHOP_CONTACT_EMAIL;

// All interpolated values flow through here. Catalog names from spreadconnect
// and error reasons from webhook payloads are not under our control; raw
// interpolation would break the HTML at best and inject content at worst.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Block javascript:/data: in href to avoid carrier-injected click hijacks if a
// tracking URL ever flows from an untrusted source.
function isSafeUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0e14;color:#c7c7c7;font-family:'SF Mono','Monaco','Menlo','Courier New',monospace;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e14;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#0a0e14;border:1px solid #1f2933;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #1f2933;">
              <div style="color:#7aa2f7;font-weight:bold;font-size:14px;letter-spacing:0.5px;">
                ${SHOP_NAME}
              </div>
              <div style="color:#5c6773;font-size:11px;margin-top:2px;">
                &gt; ${title}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;color:#c7c7c7;font-size:14px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #1f2933;color:#5c6773;font-size:11px;line-height:1.6;">
              do not reply to this email — questions or problems: <a href="mailto:${CONTACT_EMAIL}" style="color:#7aa2f7;text-decoration:none;">${CONTACT_EMAIL}</a><br/>
              <a href="${SHOP_URL}" style="color:#5c6773;text-decoration:none;">${SHOP_URL}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function label(text: string): string {
  return `<div style="color:#7aa2f7;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px;">[ ${text} ]</div>`;
}

function code(text: string): string {
  return `<div style="background:#11151c;border-left:2px solid #7aa2f7;padding:10px 14px;color:#c7c7c7;font-size:12px;word-break:break-all;">${text}</div>`;
}

function button(href: string, text: string): string {
  return `<a href="${href}" style="display:inline-block;padding:10px 18px;background:#7aa2f7;color:#0a0e14;text-decoration:none;font-weight:bold;font-size:13px;margin-top:14px;">${text}</a>`;
}

export function orderConfirmedEmail(opts: {
  externalRef: string;
  productName?: string;
  quantity?: number;
  totalAmount?: number;
  currency?: string;
}): { subject: string; html: string; text: string } {
  const subject = `order received — printing soon`;
  const item =
    opts.productName && opts.quantity
      ? `<div style="margin-top:6px;font-size:13px;">${opts.quantity}× ${esc(opts.productName)}</div>`
      : "";
  const total =
    opts.totalAmount != null && opts.currency
      ? `<div style="margin-top:4px;color:#9ece6a;font-size:13px;">paid: ${esc(opts.currency)} ${opts.totalAmount.toFixed(2)}</div>`
      : "";
  const html = shell(
    "received",
    `<div style="color:#9ece6a;font-size:15px;margin-bottom:8px;">✓ payment received</div>
     <p>thanks for supporting h4ks. printing's queued — you'll get another email when your order ships.</p>
     ${item}
     ${total}
     ${label("order ref")}
     ${code(esc(opts.externalRef))}`,
  );
  const text = `payment received. h4ks order ${opts.externalRef} is queued for printing.`;
  return { subject, html, text };
}

export function shipmentSentEmail(opts: {
  externalRef: string;
  trackingUrl?: string;
  trackingCode?: string;
}): { subject: string; html: string; text: string } {
  const subject = `your order is on the way`;
  const safeUrl = opts.trackingUrl && isSafeUrl(opts.trackingUrl) ? opts.trackingUrl : undefined;
  const trackingBlock =
    safeUrl || opts.trackingCode
      ? label("tracking") +
        (safeUrl ? code(esc(safeUrl)) : "") +
        (opts.trackingCode
          ? `<div style="margin-top:6px;font-size:13px;">code: <code style="color:#ff9e64;">${esc(opts.trackingCode)}</code></div>`
          : "") +
        (safeUrl ? button(esc(safeUrl), "track shipment →") : "")
      : "";
  const html = shell(
    "shipped",
    `<div style="color:#9ece6a;font-size:15px;margin-bottom:8px;">▸ shipment dispatched</div>
     <p>your h4ks merch left the printer. should land in a few business days.</p>
     ${trackingBlock}
     ${label("order ref")}
     ${code(esc(opts.externalRef))}`,
  );
  const text = `your h4ks order has shipped.\nref: ${opts.externalRef}${opts.trackingUrl ? "\ntrack: " + opts.trackingUrl : ""}${opts.trackingCode ? "\ncode: " + opts.trackingCode : ""}`;
  return { subject, html, text };
}

export function orderCancelledEmail(opts: { externalRef: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `order cancelled`;
  const html = shell(
    "cancelled",
    `<div style="color:#f7768e;font-size:15px;margin-bottom:8px;">▸ order cancelled</div>
     <p>your order was cancelled. if you paid, email <a href="mailto:${CONTACT_EMAIL}" style="color:#7aa2f7;text-decoration:none;">${CONTACT_EMAIL}</a> with the order ref below and we'll refund you manually.</p>
     ${label("order ref")}
     ${code(esc(opts.externalRef))}`,
  );
  const text = `your h4ks order ${opts.externalRef} was cancelled. email ${CONTACT_EMAIL} with the ref for a refund.`;
  return { subject, html, text };
}

export function orderNeedsActionEmail(opts: { externalRef: string; reason?: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `there's a problem with your order`;
  const html = shell(
    "needs-action",
    `<div style="color:#e0af68;font-size:15px;margin-bottom:8px;">⚠ order needs attention</div>
     <p>something went wrong with your order at the printer. we're investigating.</p>
     ${opts.reason ? label("reason") + code(esc(opts.reason)) : ""}
     ${label("order ref")}
     ${code(esc(opts.externalRef))}
     <p style="color:#5c6773;font-size:13px;margin-top:16px;">we'll reach out shortly. you don't need to do anything yet.</p>`,
  );
  const text = `your h4ks order ${opts.externalRef} hit a snag at the printer. we'll follow up. ${opts.reason || ""}`;
  return { subject, html, text };
}
