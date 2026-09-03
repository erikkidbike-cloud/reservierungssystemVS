// Extensible payment provider abstractions for online checkouts & webhooks.
// Supports bank reconciliation (SevDesk) alongside online processors
// (Stripe, Mollie, PayPal, SEPA QR).

export type PaymentGatewayId = 'sevdesk' | 'stripe' | 'mollie' | 'paypal' | 'manual';

export interface CheckoutSessionParams {
  bookingId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  successUrl: string;
  cancelUrl: string;
  verwendungszweck: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResult {
  sessionId: string;
  redirectUrl: string;
  provider: PaymentGatewayId;
}

export interface WebhookEventResult {
  handled: boolean;
  bookingId?: string;
  paid?: boolean;
  amountPaid?: number;
  currency?: string;
  externalTransactionId?: string;
  matchKind: PaymentGatewayId;
  raw: unknown;
}

export interface PaymentGateway {
  readonly id: PaymentGatewayId;
  createCheckoutSession?(params: CheckoutSessionParams): Promise<CheckoutSessionResult>;
  handleWebhook?(payload: string, headers: Record<string, string>): Promise<WebhookEventResult>;
}
