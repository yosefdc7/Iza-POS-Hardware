'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
export function ApprovalActions({id,isAdmin,isOwner}:{id:string;isAdmin:boolean;isOwner:boolean}) {
 const router=useRouter();const [busy,setBusy]=useState(false);const [reason,setReason]=useState('');
 async function decide(decision:string) {
  setBusy(true);
  try {
   const res=await fetch(`/api/product-approvals/${id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,reason})});
   const data=await res.json();if(!res.ok) throw new Error(data.error);
   toast.success(`Request ${decision.toLowerCase()}`);router.refresh();
  }catch(e){toast.error(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}
 }
 return <div className="flex flex-wrap items-center gap-2 mt-3">
  {isAdmin && <><input aria-label="Rejection reason" placeholder="Reason (required to reject)" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="border rounded p-2"/><button disabled={busy} className="rounded bg-primary text-primary-foreground px-3 py-2 disabled:opacity-50" onClick={()=>decide('APPROVED')}>Approve</button><button disabled={busy||!reason.trim()} className="border rounded px-3 py-2 disabled:opacity-50" onClick={()=>decide('REJECTED')}>Reject</button></>}
  {isOwner && <button disabled={busy} onClick={()=>decide('CANCELLED')} className="border rounded px-3 py-2">Cancel request</button>}
 </div>;
}
