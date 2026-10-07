import { describe, it, expect } from "vitest";
import { firstTracking, type GelatoOrder } from "@/lib/gelato";

const order = (shipment: GelatoOrder["shipment"]): GelatoOrder => ({
  id: "o",
  orderReferenceId: "h4ks-ref",
  fulfillmentStatus: "shipped",
  financialStatus: "paid",
  currency: "EUR",
  shipment,
});

describe("firstTracking", () => {
  it("reads tracking, carrier and delivery window from the shipment", () => {
    expect(
      firstTracking(
        order({
          shipmentMethodName: "DHL Parcel",
          minDeliveryDate: "2026-10-08",
          maxDeliveryDate: "2026-10-12",
          packages: [{}, { trackingCode: "0034", trackingUrl: "https://nolp.dhl.de/?piececode=0034" }],
        }),
      ),
    ).toEqual({
      code: "0034",
      url: "https://nolp.dhl.de/?piececode=0034",
      carrier: "DHL Parcel",
      minDeliveryDate: "2026-10-08",
      maxDeliveryDate: "2026-10-12",
    });
  });

  it("returns nothing for an order without a shipment", () => {
    expect(firstTracking(order(undefined))).toEqual({});
  });
});
