// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {lockCheckoutProducts,validateCheckoutStock} from '@/lib/checkout-stock';
it('waits for a pending stock writer before reading current stock',async()=>{
 let release!:()=>void;
 const pendingWriter=new Promise<void>(resolve=>release=resolve);
 let stock=20;
 const tx={$queryRaw:vi.fn(()=>pendingWriter),product:{findMany:vi.fn(async()=>[{id:'p',name:'Hammer',stock}])}};
 const read=lockCheckoutProducts(tx as never,['p']);
 await Promise.resolve();expect(tx.product.findMany).not.toHaveBeenCalled();
 stock=1;release();const products=await read;
 expect(()=>validateCheckoutStock(products,[{productId:'p',stockDeduction:5}])).toThrow(/Insufficient stock/);
});
it('sums base and packaged quantities before checking available stock',()=>{
 expect(()=>validateCheckoutStock([{id:'p',name:'Hammer',stock:5}],[{productId:'p',stockDeduction:3},{productId:'p',stockDeduction:3}])).toThrow(/Insufficient stock/);
});
