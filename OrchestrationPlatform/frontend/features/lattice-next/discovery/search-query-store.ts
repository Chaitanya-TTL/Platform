const KEY="lattice-next:last-discovery-query";
let memory="";
export function rememberDiscoveryQuery(query:string){memory=query.trim();try{sessionStorage.setItem(KEY,memory)}catch{}}
export function readDiscoveryQuery(){if(memory)return memory;try{return sessionStorage.getItem(KEY)?.trim()??""}catch{return""}}


