// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { $transaction: mocks.transaction } }));
import { submitProductChange, reviewProductChange } from '@/lib/product-approvals';
const staff = { id: 'staff', role: 'CASHIER' };
const admin = { id: 'admin', role: 'ADMIN' };
let product: any, request: any, tx: any;
beforeEach(() => {
 product = { id: 'p', name: 'Hammer', price: 10, stock: 20, active: true, quantityPrecision: 0 };
 request = null;
 tx = { $queryRaw: vi.fn(), product: { findUnique: vi.fn(async () => product), update: vi.fn(async ({data}: any) => Object.assign(product, data)) }, productChangeRequest: {
 create: vi.fn(async ({data}: any) => request = { id: 'r', ...data }), findUnique: vi.fn(async () => request),
 update: vi.fn(async ({data}: any) => Object.assign(request, data)),
 }, stockAdjustment: { create: vi.fn() } };
 mocks.transaction.mockImplementation((fn: any) => fn(tx));
});
it('queues staff edits without changing the item, then applies once on approval', async () => {
 await submitProductChange(staff, { productId: 'p', operation: 'EDIT', reason: 'New price', changes: { price: 12 }, original: { price: 10 } });
 expect(product.price).toBe(10); expect(request.status).toBe('PENDING');
 await expect(reviewProductChange(staff, 'r', 'APPROVED')).rejects.toThrow(/admin/i);
 await reviewProductChange(admin, 'r', 'APPROVED');
 expect(product.price).toBe(12); expect(request.status).toBe('APPROVED');
 await expect(reviewProductChange(admin, 'r', 'APPROVED')).rejects.toThrow(/pending/i);
 expect(tx.product.update).toHaveBeenCalledTimes(1);
});
it('rejects stale edits instead of overwriting new values', async () => {
 await submitProductChange(staff, { productId: 'p', operation: 'EDIT', reason: 'Price', changes: { price: 12 }, original: { price: 10 } });
 product.price = 15;
 await expect(reviewProductChange(admin, 'r', 'APPROVED')).rejects.toThrow(/changed/i);
 expect(product.price).toBe(15);
});
it('requires a rejection reason and permits only owner cancellation', async () => {
 await submitProductChange(staff, { productId: 'p', operation: 'ARCHIVE', reason: 'Discontinued' });
 await expect(reviewProductChange(admin, 'r', 'REJECTED')).rejects.toThrow(/reason/i);
 await expect(reviewProductChange({id:'other',role:'CASHIER'}, 'r', 'CANCELLED')).rejects.toThrow();
 await reviewProductChange(staff, 'r', 'CANCELLED'); expect(product.active).toBe(true);
});
it('archives without deleting history', async () => {
 await submitProductChange(staff, { productId:'p', operation:'ARCHIVE', reason:'Discontinued' });
 await reviewProductChange(admin, 'r', 'APPROVED'); expect(product.active).toBe(false);
});
it('blocks absolute stock edits and invalid negative stock adjustments', async () => {
 await expect(submitProductChange(staff, {productId:'p',operation:'EDIT',reason:'Count',changes:{stock:1},original:{stock:20}})).rejects.toThrow();
 await submitProductChange(staff, {productId:'p',operation:'STOCK',reason:'Correction',changes:{delta:-21,stockReason:'CORRECTION'}});
 await expect(reviewProductChange(admin,'r','APPROVED')).rejects.toThrow(/stock/i);
 expect(tx.stockAdjustment.create).not.toHaveBeenCalled();
});
it('lets staff request reactivation and admin restore an inactive item', async () => {
 product.active=false;
 await submitProductChange(staff,{productId:'p',operation:'EDIT',reason:'Restock item',changes:{active:true},original:{active:false}});
 expect(product.active).toBe(false);
 await reviewProductChange(admin,'r','APPROVED');expect(product.active).toBe(true);
 product.active=false;
 await submitProductChange(admin,{productId:'p',operation:'EDIT',reason:'Restore item',changes:{active:true},original:{active:false}});
 expect(product.active).toBe(true);
});
