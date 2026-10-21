import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {transform,loadBindings} from 'next/dist/build/swc/index.js';
import {AuthRetryableFetchError,AuthApiError,AuthSessionMissingError} from '@supabase/supabase-js';
import {HttpError} from '../lib/http.ts';

await loadBindings();
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../lib/server.ts',import.meta.url),'utf8');
const {code}=await transform(source,{filename:'server.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}});
function serverWith(result){
 const module={exports:{}};
 const client={auth:{getUser:async()=>result}};
 const mockedRequire=name=>{
  if(name==='server-only')return {};
  if(name==='@supabase/ssr')return {createServerClient:()=>client};
  if(name==='next/headers')return {cookies:async()=>({getAll:()=>[]})};
  if(name==='./http')return {HttpError};
  if(name==='./origin')return {};
  return require(name);
 };
 new Function('require','module','exports',code)(mockedRequire,module,module.exports);
 return module.exports;
}
// The client is mocked; no service credentials or network requests are used.
process.env.NEXT_PUBLIC_SUPABASE_URL||='https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||='test-anon-key';
test('authentication network failures and service outages return 503 instead of redirecting to login',async()=>{
 for(const error of [new AuthRetryableFetchError('fetch failed',0),new AuthRetryableFetchError('timeout',0),new AuthApiError('Service unavailable',503,'unexpected_failure'),new AuthApiError('Rate limited',429,'over_request_rate_limit')]){
  const server=serverWith({data:{user:null},error});
  await assert.rejects(server.identity(),e=>e instanceof HttpError&&e.status===503);
 }
});
test('missing, invalid and unverified sessions still require login',async()=>{
 for(const result of [{data:{user:null},error:new AuthSessionMissingError()},{data:{user:null},error:new AuthApiError('Invalid token',401,'bad_jwt')},{data:{user:{id:'unverified'}},error:null}]){
  const server=serverWith(result);
  await assert.rejects(server.identity(),e=>e instanceof HttpError&&e.status===401);
 }
});
test('verified authenticated users are accepted',async()=>{
 const user={id:'verified',email_confirmed_at:'2026-01-01T00:00:00Z'};
 const server=serverWith({data:{user},error:null});
 assert.equal((await server.identity()).user,user);
});
