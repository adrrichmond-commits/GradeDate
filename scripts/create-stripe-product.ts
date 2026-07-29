/**
 * Creates the GradeDate Premium product and price in Stripe.
 *
 * Usage: STRIPE_SECRET_KEY=sk_test_... bun run scripts/create-stripe-product.ts
 *
 * Prints the resulting price_id for hardcoding into the codebase.
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error("Error: STRIPE_SECRET_KEY environment variable is required.");
  console.error("Usage: STRIPE_SECRET_KEY=sk_test_... bun run scripts/create-stripe-product.ts");
  process.exit(1);
}

// Use fetch directly to avoid needing to install stripe SDK for a one-off script
async function stripeRequest(
  path: string,
  method: string = "GET",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body as Record<string, string>).toString() : undefined,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Stripe API error ${response.status}: ${err}`);
  }

  return response.json();
}

async function main() {
  console.log("Creating GradeDate Premium product...");

  // Step 1: Create the product
  const product = (await stripeRequest("products", "POST", {
    name: "GradeDate Premium",
    description: "Monthly subscription to GradeDate — AI-powered dating profile coaching, percentile rankings, and smart matching.",
  })) as { id: string; name: string };

  console.log(`✅ Product created: ${product.name} (${product.id})`);

  // Step 2: Create the recurring price
  const price = (await stripeRequest("prices", "POST", {
    product: product.id,
    unit_amount: "599", // $5.99 in cents
    currency: "usd",
    recurring: JSON.stringify({ interval: "month" }),
  })) as { id: string; unit_amount: number; currency: string; recurring: { interval: string } };

  console.log(`✅ Price created: $${(price.unit_amount / 100).toFixed(2)}/${price.recurring.interval} (${price.id})`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  PREMIUM_PRICE_ID = "${price.id}"`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Add this constant to src/api-handler.ts and update the checkout handler.");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
