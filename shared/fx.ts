import type { Currency } from "./travel-options";

// CNY per 1 major unit, scaled by 1_000_000.
// Reference mid-market rates on 2026-10-12. Users can override the estimate.
export const referenceRateDate = "2026-10-12";

export const referenceRatesPpm: Record<Currency, number> = {
  CNY: 1000000,
  JPY: 42296,
  THB: 199470,
  KRW: 5028,
  HKD: 854499,
  TWD: 209826,
  SGD: 5235740,
  MYR: 1642241,
  VND: 259,
  IDR: 374,
  PHP: 106803,
  NZD: 3749010,
  AUD: 4668162,
  USD: 6705820,
  EUR: 7491231,
  GBP: 8862922,
  CAD: 4698015,
  CHF: 8040465,
  AED: 1825955,
  INR: 69920,
};

export function referencePpm(currency: Currency) {
  return referenceRatesPpm[currency];
}

export function estimateCny(amountCents: number, ppm: number) {
  return Math.round((amountCents * ppm) / 1_000_000);
}

export function ppmFromEstimate(amountCents: number, cnyCents: number) {
  if (amountCents <= 0) return referenceRatesPpm.CNY;
  return Math.round((cnyCents * 1_000_000) / amountCents);
}
