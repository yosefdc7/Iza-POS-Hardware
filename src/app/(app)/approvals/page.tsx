import Link from 'next/link';
import {prisma} from '@/lib/db';
import {requireStaff} from '@/lib/require-staff';
import {ApprovalActions} from '@/components/products/approval-actions';
export const dynamic='force-dynamic';
const labels:Record<string,string>={EDIT:'Edit item',ARCHIVE:'Archive item',STOCK:'Adjust stock',PACK_ADD:'Add packaging',PACK_EDIT:'Edit packaging',PACK_DELETE:'Delete packaging'};
const value=(v:unknown)=>v==null?'—':String(v);
export default async function ApprovalsPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const {user}=await requireStaff();const isAdmin=user.role==='ADMIN';
 const page=Math.max(1,Number((await searchParams).page)||1);
 const requests=await prisma.productChangeRequest.findMany({where:isAdmin?{}:{requesterId:user.id},include:{product:{include:{packagings:true}}},orderBy:[{createdAt:'desc'}],take:50,skip:(page-1)*50});
 return <main className="p-4 sm:p-6 space-y-4"><h1 className="text-2xl font-bold">{isAdmin?'Approvals':'My requests'}</h1><p className="text-muted-foreground">Changes take effect only after approval. Rejected and cancelled requests leave the item unchanged.</p>
 {!requests.length&&<p>No requests yet.</p>}
 {requests.map(r=>{
  const changes=r.changes as Record<string,unknown>;const original=r.original as Record<string,unknown>;
  const current:Record<string,unknown>=r.operation.startsWith('PACK_')?(r.product.packagings.find(p=>p.id===changes.packagingId)||{}):r.product;
  const fields=r.operation==='PACK_DELETE'?['name','conversionQty','price','barcode']:Object.keys(changes).filter(k=>k!=='packagingId');
  return <section key={r.id} className="border rounded-lg p-4 space-y-2" data-request-id={r.id}><div className="flex justify-between gap-3"><h2 className="font-semibold">{labels[r.operation]} — <Link className="underline" href={`/products/${r.productId}`}>{r.product.name}</Link></h2><strong>{r.status}</strong></div>
   <p>Requested by {r.requesterName} · {r.createdAt.toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p><p>Reason: {r.reason}</p>
   {r.operation==='ARCHIVE'?<p>This item will be hidden from POS. Past receipts will be kept.</p>:<div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Field</th><th>Original</th><th>Current</th><th>Requested</th></tr></thead><tbody>{fields.map(key=><tr key={key}><td className="py-2">{key}</td><td>{value(original[key])}</td><td>{value(current[key])}</td><td className="break-all">{r.operation==='PACK_DELETE'?'Remove packaging':value(changes[key])}</td></tr>)}</tbody></table></div>}
   {r.operation==='STOCK'&&<p>Current stock: {String(r.product.stock)}. Approval adds {String(changes.delta)} base units.</p>}
   {r.reviewerName&&<p>{r.status} by {r.reviewerName}{r.reviewReason?`: ${r.reviewReason}`:''}</p>}
   {r.status==='PENDING'&&<ApprovalActions id={r.id} isAdmin={isAdmin} isOwner={r.requesterId===user.id}/>}
  </section>;
 })}
 <div className="flex gap-4">{page>1&&<Link href={`/approvals?page=${page-1}`}>Previous</Link>}{requests.length===50&&<Link href={`/approvals?page=${page+1}`}>Next</Link>}</div></main>;
}
