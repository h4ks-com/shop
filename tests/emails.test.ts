import { describe, it, expect } from "vitest";
import {
  orderConfirmedEmail,
  orderCancelledEmail,
  orderNeedsActionEmail,
  shipmentSentEmail,
} from "@/lib/emails";

describe("email templates", () => {
  it("escapes html-special characters in product name", () => {
    const { html } = orderConfirmedEmail({
      externalRef: "h4ks-ref",
      productName: '<script>alert("xss")</script>',
      quantity: 1,
      totalAmount: 19.99,
      currency: "USD",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes html in needs-action error reason", () => {
    const { html } = orderNeedsActionEmail({
      externalRef: "h4ks-ref",
      reason: 'address <invalid> & "broken"',
    });
    expect(html).not.toContain("<invalid>");
    expect(html).toContain("&lt;invalid&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("escapes external order ref", () => {
    const { html } = orderCancelledEmail({ externalRef: 'h4ks-"</div>' });
    expect(html).not.toContain('h4ks-"</div>');
    expect(html).toContain("&quot;");
  });

  it("escapes tracking code in shipment email", () => {
    const { html } = shipmentSentEmail({
      externalRef: "ref",
      trackingCode: "<b>code</b>",
      trackingUrl: "https://track.example/abc",
    });
    expect(html).not.toContain("<b>code</b>");
    expect(html).toContain("&lt;b&gt;code&lt;/b&gt;");
  });

  it("keeps plain text passthrough intact", () => {
    const { html } = orderConfirmedEmail({
      externalRef: "h4ks-ref",
      productName: "Plain Tee",
      quantity: 2,
      totalAmount: 30,
      currency: "USD",
    });
    expect(html).toContain("Plain Tee");
    expect(html).toContain("h4ks-ref");
  });
});
