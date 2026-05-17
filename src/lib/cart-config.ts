// Sum of all item quantities cannot exceed this. The flat shipping rate in
// Stripe is set to safely cover up to this many units; raising it requires
// rethinking shipping.
export const CART_MAX_ITEMS = 5;
