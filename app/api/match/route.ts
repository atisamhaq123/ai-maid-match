import {context,check,failure,origin,env,AppError} from '../../../lib/server';
import {readJSON} from '../../../lib/http';import {uuid,validateBrief,type Maid} from '../../../lib/domain';
import {prepareAIProfiles,validateAIShortlist,aiShortlistSchema,AI_SYSTEM_PROMPT} from '../../../lib/ai-match';
export const maxDuration=60;
export async function POST(request:Request){try{
 origin(request);const body=await readJSON(request,5000);if(!uuid(body.organization))throw new AppError('Invalid family workspace.');
 if(body.message!==undefined&&(typeof body.message!=='string'||body.message.length>1000))throw new AppError('Keep your assistant request under 1,000 characters.');
 const {client}=await context(body.organization);const organization=check(await client.from('mm_organizations').select('brief,version').eq('id',body.organization).single());if(!organization)throw new AppError('Family workspace unavailable.',404);
 let brief;try{brief=validateBrief(organization.brief);}catch{throw new AppError('Save complete household requirements before asking the assistant.');}
 const maids=(check(await client.from('mm_maids').select('*').eq('consent',true).eq('available',true).order('id').limit(1000))||[]) as Maid[];
 const profiles=prepareAIProfiles(brief,maids);if(!profiles.length)throw new AppError('There are no available profiles to review yet.');
 const key=env('OPENAI_API_KEY'),model=env('OPENAI_CHAT_MODEL');check(await client.rpc('mm_reserve_ai',{org:body.organization}));
 let response:Response;try{response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model,max_completion_tokens:4500,response_format:{type:'json_schema',json_schema:{name:'family_ai_shortlist',strict:true,schema:aiShortlistSchema}},messages:[{role:'system',content:AI_SYSTEM_PROMPT},{role:'user',content:JSON.stringify({requirements:brief,familyRequest:(body.message||'Find the most relevant profiles for our household.').trim(),profiles})}]})});}catch{throw new AppError('The assistant took too long to respond. Please retry. This reserved request counts toward your daily allowance.',504);}
 if(!response.ok){console.error(JSON.stringify({event:'ai.provider.failed',status:response.status}));throw new AppError(response.status===429?'The AI service is busy or its provider quota is exhausted. Please retry later.':'The AI service could not generate scores. Check the configured model supports structured outputs, then retry. No AI scores were substituted.',502);}
 const data=await response.json();const choice=data.choices?.[0];if(choice?.message?.refusal)throw new AppError('The assistant could not evaluate that request. Try describing household tasks, schedule, and budget.',422);
 if(choice?.finish_reason!=='stop')throw new AppError('The assistant response was incomplete. Please retry.',502);
 let result;try{result=validateAIShortlist(JSON.parse(choice.message.content),new Set(profiles.map(p=>p.id)));}catch(e){throw new AppError(e instanceof SyntaxError?'The assistant returned unreadable results. Please retry.':(e as Error).message,502);}
 const current=check(await client.from('mm_organizations').select('version').eq('id',body.organization).single());if(!current||current.version!==organization.version)throw new AppError('Your household needs changed while the assistant was working. Generate a fresh shortlist.',409);
 if(result.shortlist.length){const visible=check(await client.from('mm_maids').select('id').in('id',result.shortlist.map(m=>m.id)).eq('consent',true).eq('available',true))||[];if(visible.length!==result.shortlist.length)throw new AppError('A recommended profile is no longer available. Generate a fresh shortlist.',409);}
 return Response.json({...result,organization:body.organization,version:organization.version,reviewed:profiles.length,available:maids.length,source:'openai'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}}
