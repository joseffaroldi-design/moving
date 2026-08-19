"use client";
// Phase 3 V1 staff delivery history and authorized retry surface.
import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { getBrowserClient } from "@/lib/supabase/client";
interface Row { id:string; event_type:string|null; to_address:string|null; subject:string|null; status:string|null; sent_at:string|null; created_at:string; error_message:string|null; retry_count:number; }
export default function CommunicationsPage(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[retrying,setRetrying]=useState<string|null>(null);
 const load=useCallback(async()=>{setLoading(true);setError(null);const s=getBrowserClient();const {data,error}=await s.from("communications").select("id,event_type,to_address,subject,status,sent_at,created_at,error_message,retry_count").eq("channel","email").order("created_at",{ascending:false}).limit(200);if(error)setError(error.message);else setRows((data??[]) as Row[]);setLoading(false);},[]);
 useEffect(()=>{void load();},[load]);
 async function retry(id:string){setRetrying(id);const s=getBrowserClient();const {error}=await s.functions.invoke("customer-email",{body:{retry_communication_id:id}});if(error)setError(error.message);await load();setRetrying(null);}
 return <div><PageHeader title="Customer Emails" description="Lifecycle email history, delivery status, failures, and authorized retries." breadcrumbs={[{label:"Operations",href:"/dashboard"},{label:"Customer Emails"}]}/>
 {error&&<ErrorState title="Customer email error" message={error} onRetry={load}/>} 
 {!error&&!loading&&rows.length===0&&<EmptyState icon={Mail} title="No customer emails yet" description="Lifecycle emails will appear here as business events occur."/>}
 {!error&&rows.length>0&&<DataTable><Thead><Th>Event</Th><Th>Recipient</Th><Th>Subject</Th><Th>Status</Th><Th>Sent</Th><Th>Action</Th></Thead><Tbody>{rows.map(r=><Tr key={r.id}><Td>{(r.event_type??"—").replaceAll("_"," ")}</Td><Td>{r.to_address??"—"}</Td><Td>{r.subject??"—"}</Td><Td><span className={r.status==="failed"?"font-medium text-red-700":"font-medium text-slate-700"}>{r.status??"—"}</span>{r.error_message&&<div className="max-w-xs text-xs text-red-600">{r.error_message}</div>}</Td><Td>{r.sent_at?new Date(r.sent_at).toLocaleString():"—"}</Td><Td>{r.status==="failed"?<Button variant="outline" disabled={retrying===r.id} onClick={()=>void retry(r.id)}><RefreshCw className="h-4 w-4"/> Retry</Button>:"—"}</Td></Tr>)}</Tbody></DataTable>}
 </div>;
}
