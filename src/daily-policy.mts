/** Minimal atomic interface supplied by Netlify Blobs in production. */
type Claims = { setJSON: (key:string, value:unknown, options:{onlyIfNew:true}) => Promise<{modified:boolean}> };

export async function reserveDailyWrite(store:Claims, date:string, limit:number, key:string, slug:string) {
  for (let slot = 1; slot <= Math.min(2, Math.max(1, Math.floor(limit) || 2)); slot++) {
    const claim = await store.setJSON(`${date}-${slot}`, {key,slug,state:'reserved'}, {onlyIfNew:true});
    if (claim.modified) return true;
  }
  return false;
}

/** A rejected or ambiguous response stops the batch; never blindly retry. */
export async function dispatchDrafts(limit:number, stopped:()=>boolean, send:()=>Promise<{ok:boolean; draftsCreated?:number}>) {
  let completed = 0;
  for (let i=0; i<Math.min(2, Math.max(1, Math.floor(limit) || 2)); i++) {
    if (stopped()) break;
    let result:{ok:boolean; draftsCreated?:number};
    try { result = await send(); } catch { break; }
    if (!result.ok || result.draftsCreated !== 1) break;
    completed++;
  }
  return completed;
}
