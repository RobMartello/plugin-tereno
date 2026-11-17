import { TerenoPaymentPendingError, type BuyResult } from 'tereno-client';

export class TerenoBudgetError extends Error {}
interface Attempt {
  reservedUsd: number;
  resume?: () => Promise<BuyResult<unknown>>;
  active?: Promise<BuyResult<unknown>>;
}

/** Retain the SDK's original authorization while its outcome is unknown.
 * Unresolved attempts keep their budget reservation and are never evicted to
 * make room for a new payment. State is process-local, like the daily budget. */
export class PaidCalls {
  private attempts = new Map<string, Attempt>();
  constructor(
    private canReserve: (amount: number) => boolean,
    private recordPaid: (result: BuyResult<unknown>, reservation: number) => void,
  ) {}

  async invoke<T>(key: string, reserveUsd: number, start: () => Promise<BuyResult<T>>): Promise<{ result: BuyResult<T>; newlyAccounted: boolean }> {
    let attempt = this.attempts.get(key);
    if (attempt?.active) return { result: await attempt.active as BuyResult<T>, newlyAccounted: false };
    if (!attempt) {
      const reserved = [...this.attempts.values()].reduce((sum, item) => sum + item.reservedUsd, 0);
      if (this.attempts.size >= 100 || !this.canReserve(reserved + reserveUsd)) {
        throw new TerenoBudgetError('daily USDC budget exhausted or reserved by unresolved payments');
      }
      attempt = { reservedUsd: reserveUsd };
      this.attempts.set(key, attempt);
    }
    const current = attempt;
    current.active = (async () => {
      try {
        const result = await (current.resume ? current.resume() : start());
        this.recordPaid(result, current.reservedUsd);
        this.attempts.delete(key);
        return result;
      } catch (error) {
        if (error instanceof TerenoPaymentPendingError) current.resume = error.resume;
        else if (current.resume) {
          // A later rejection cannot prove that an earlier timed-out transfer
          // never settled. Retain the original signature and reservation.
          throw new TerenoPaymentPendingError('Previous payment remains unresolved. Retry this same action; do not authorize another payment.', current.resume);
        } else this.attempts.delete(key);
        throw error;
      }
    })();
    try { return { result: await current.active as BuyResult<T>, newlyAccounted: true }; }
    finally { current.active = undefined; }
  }
}
