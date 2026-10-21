export function allowedOrigin(incoming:string|null,configured:string,development=false){
 if(!incoming)return false;
 try{const source=new URL(incoming),target=new URL(configured);if(source.origin!==incoming)return false;if(source.origin===target.origin)return true;
 const loopback=new Set(['localhost','127.0.0.1']);return development&&loopback.has(source.hostname)&&loopback.has(target.hostname)&&source.protocol===target.protocol&&source.port===target.port;
 }catch{return false;}
}
