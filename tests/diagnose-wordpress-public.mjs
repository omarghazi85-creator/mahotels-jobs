// Read-only, public WP REST availability probe. Never sends credentials or mutates posts.
const url='https://mahotels.net/wp-json/wp/v2/ma_hotel_job?per_page=1&_fields=id,link,title,status';
try {
 const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 let shape='unavailable';
 if(response.ok){
  const rows=await response.json();
  shape=Array.isArray(rows)?'array-'+rows.length:typeof rows;
 }
 console.log(JSON.stringify({wordpress_public_job_api_status:response.status,shape,authenticated:false,write:false}));
}catch(e){console.log(JSON.stringify({wordpress_public_job_api_status:'unavailable',error:String(e),authenticated:false,write:false}));}
