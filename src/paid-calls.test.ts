import { describe, expect, test } from 'bun:test';
import { TerenoPaymentPendingError } from 'tereno-client';
import { PaidCalls, TerenoBudgetError } from './paid-calls';

const result = { data: { pricing: { pricePaidUsd: 0.02 } }, settlement: null };

describe('same-authorization payment recovery', () => {
  test('pending payment keeps budget reserved and resumes instead of buying again', async () => {
    let started=0, resumed=0, accounted=0;
    const calls=new PaidCalls(amount=>amount <= 0.1, ()=>accounted++);
    const start=async()=>{ started++; throw new TerenoPaymentPendingError('timeout',async()=>{resumed++;return result;}); };
    await expect(calls.invoke('original',0.1,start)).rejects.toBeInstanceOf(TerenoPaymentPendingError);
    await expect(calls.invoke('other',0.1,async()=>result)).rejects.toBeInstanceOf(TerenoBudgetError);
    expect((await calls.invoke('original',0.1,start)).result).toEqual(result);
    expect(started).toBe(1);expect(resumed).toBe(1);expect(accounted).toBe(1);
  });
  test('concurrent identical actions share one attempt and are accounted once', async () => {
    let finish!: (value:typeof result)=>void;
    const pending=new Promise<typeof result>(resolve=>{finish=resolve;});
    let started=0, accounted=0;
    const calls=new PaidCalls(()=>true,()=>accounted++);
    const start=()=>{started++;return pending;};
    const first=calls.invoke('same',0.1,start), second=calls.invoke('same',0.1,start);
    finish(result);
    const [a,b]=await Promise.all([first,second]);
    expect(started).toBe(1);expect(accounted).toBe(1);
    expect(a.newlyAccounted).toBe(true);expect(b.newlyAccounted).toBe(false);
  });
  test('definitive initial rejection releases the reservation', async () => {
    const calls=new PaidCalls(amount=>amount<=0.1,()=>{});
    await expect(calls.invoke('rejected',0.1,async()=>{throw new Error('quote rejected before signing');})).rejects.toThrow();
    expect((await calls.invoke('other',0.1,async()=>result)).newlyAccounted).toBe(true);
  });
  test('a later generic rejection cannot erase an earlier uncertain payment', async () => {
    let started=0;
    const calls=new PaidCalls(amount=>amount<=0.1,()=>{});
    const start=async()=>{started++;throw new TerenoPaymentPendingError('unknown',async()=>{throw new Error('nonce already used');});};
    await expect(calls.invoke('same',0.1,start)).rejects.toBeInstanceOf(TerenoPaymentPendingError);
    await expect(calls.invoke('same',0.1,start)).rejects.toBeInstanceOf(TerenoPaymentPendingError);
    await expect(calls.invoke('other',0.1,async()=>result)).rejects.toBeInstanceOf(TerenoBudgetError);
    expect(started).toBe(1);
  });
});
