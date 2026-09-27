// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({transaction:vi.fn(),session:vi.fn()}));
vi.mock('@/lib/db',()=>({prisma:{$transaction:mocks.transaction}}));
vi.mock('@/lib/auth',()=>({auth:{api:{getSession:mocks.session}}}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
import {POST} from '@/app/api/sales/[id]/refund/route';
it('restores base-unit stock for a partial packaged refund',async()=>{
 mocks.session.mockResolvedValue({user:{id:'admin',role:'ADMIN'}});
 const update=vi.fn();const tx={$queryRaw:vi.fn(),sale:{findUnique:vi.fn().mockResolvedValue({status:'COMPLETED',items:[{id:'item',productId:'product',name:'Box',quantity:2,price:40,packagingQty:5}],refunds:[]}),update:vi.fn()},refund:{create:vi.fn().mockResolvedValue({id:'refund'})},product:{update}};
 mocks.transaction.mockImplementation(fn=>fn(tx));
 const response=await POST(new NextRequest('http://localhost/api/sales/sale/refund',{method:'POST',body:JSON.stringify({items:[{saleItemId:'item',quantity:1}],restoreStock:true})}),{params:Promise.resolve({id:'sale'})});
 expect(response.status).toBe(200);expect(update).toHaveBeenCalledWith({where:{id:'product'},data:{stock:{increment:5}}});
});
