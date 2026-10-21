import 'server-only';
import Stripe from 'stripe';import {admin,AppError,check,env} from './server';import {prices,type PlanId} from './plans';import {selectSubscription,validateSubscription,validateCheckout,sessionActions,blockingStatuses,planChange} from './billing-policy';
export {blockingStatuses};
export type BillingOrg={id:string;name:string;plan:PlanId;stripe_customer_id:string|null;stripe_subscription_id:string|null};
export function stripe(){return new Stripe(env('STRIPE_SECRET_KEY'),{maxNetworkRetries:1,timeout:12000});}
export async function withBillingLock<T>(id:string,fn:(o:BillingOrg,lease:string)=>Promise<T>){const lease=crypto.randomUUID();if(!check(await admin().rpc('mm_billing_lease',{org:id,lease})))throw new AppError('Billing is already being updated. Please retry shortly.',409);try{const o=check(await admin().from('mm_organizations').select('id,name,plan,stripe_customer_id,stripe_subscription_id').eq('id',id).single());if(!o)throw new AppError('Family workspace unavailable.',404);return await fn(o,lease);}finally{await admin().from('mm_billing_locks').delete().eq('organization_id',id).eq('token',lease);}}
export async function reconcile(client:Stripe,o:BillingOrg,lease:string,eventId=`sync:${crypto.randomUUID()}`,preferred?:string){
 if(!o.stripe_customer_id)return null;
 const customer=await client.customers.retrieve(o.stripe_customer_id);if(customer.deleted||customer.metadata.application!=='maid-match'||customer.metadata.organization_id!==o.id)throw new AppError('Stripe customer metadata does not match this family.',409);
 const subscriptions:Stripe.Subscription[]=[];for await(const s of client.subscriptions.list({customer:o.stripe_customer_id,status:'all',limit:100}))subscriptions.push(s);
 let selected;try{selected=selectSubscription(subscriptions,o,preferred);}catch(e){throw new AppError((e as Error).message,409);}
 if(!selected){if(o.stripe_subscription_id)throw new AppError('The authoritative subscription is missing from Stripe. Review the mapping before continuing.',409);return null;}
 // Read the authoritative current object, never use webhook payload state.
 const subscription=await client.subscriptions.retrieve(selected.id);let state;try{state=validateSubscription(subscription,o);}catch(e){throw new AppError((e as Error).message,409);}
 check(await admin().rpc('mm_sync_billing',{org:o.id,lease,event_id:eventId,customer:o.stripe_customer_id,subscription:subscription.id,new_plan:state.plan,new_status:subscription.status,start_at:new Date(state.item.current_period_start*1000).toISOString(),end_at:new Date(state.item.current_period_end*1000).toISOString(),cancel_pending:subscription.cancel_at_period_end}));return subscription;
}
async function portalConfiguration(client:Stripe,base:string){
 const p=prices();const details=await Promise.all([client.prices.retrieve(p.starter),client.prices.retrieve(p.pro)]);
 if(details.some(x=>!x.active||x.type!=='recurring'||x.recurring?.interval!=='month'||x.recurring.interval_count!==1)||details[0].currency!==details[1].currency)throw new AppError('Configure active monthly Starter and Pro prices in the same currency.',503);
 const grouped=new Map<string,string[]>();details.forEach(x=>{const product=typeof x.product==='string'?x.product:x.product.id;grouped.set(product,[...(grouped.get(product)||[]),x.id]);});
 const fingerprint=`${p.starter}:${p.pro}`;let existing:Stripe.BillingPortal.Configuration|undefined;
 for await(const c of client.billingPortal.configurations.list({active:true,limit:100})){if(c.metadata?.maid_match_prices===fingerprint){existing=c;break;}}
 if(existing)return existing.id;
 const c=await client.billingPortal.configurations.create({name:'Maid-Match subscriptions',default_return_url:`${base}/app?view=billing`,metadata:{maid_match_prices:fingerprint},business_profile:{headline:'Manage your Maid-Match family plan'},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},subscription_update:{enabled:true,default_allowed_updates:['price'],proration_behavior:'create_prorations',products:[...grouped].map(([product,prices])=>({product,prices})),trial_update_behavior:'end_trial'}}},{idempotencyKey:`mm-portal-${p.starter}-${p.pro}`});return c.id;
}
export async function billingAction(client:Stripe,o:BillingOrg,lease:string,userEmail:string|undefined,action:string,plan:PlanId|undefined,sessionId?:string){
 let preferred:string|undefined;
 if(sessionId){if(!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId))throw new AppError('Invalid Checkout session.');try{preferred=validateCheckout(await client.checkout.sessions.retrieve(sessionId),o);}catch(e){throw new AppError((e as Error).message,409);}}
 let sub=await reconcile(client,o,lease,undefined,preferred);
 if(action==='sync')return {ok:true};
 const base=env('NEXT_PUBLIC_APP_URL').replace(/\/$/,'');const returnUrl=`${base}/app?view=billing&billing=sync&organization=${o.id}`;
 const p=prices();
 if(!o.stripe_customer_id){const customer=await client.customers.create({name:o.name,email:userEmail,metadata:{application:'maid-match',organization_id:o.id}},{idempotencyKey:`mm-customer-${o.id}`});check(await admin().rpc('mm_set_customer',{org:o.id,lease,customer:customer.id}));o.stripe_customer_id=customer.id;}
 if(action==='portal'){const configuration=await portalConfiguration(client,base);return {url:(await client.billingPortal.sessions.create({customer:o.stripe_customer_id,configuration,return_url:returnUrl})).url};}
 if(!plan)throw new AppError('Select Starter or Pro.');
 if(sub&&blockingStatuses.includes(sub.status)){
 if(!['active','trialing'].includes(sub.status))throw new AppError(`Your subscription is ${sub.status}. Use Manage current plan to resolve it.`,409);
 const change=planChange(sub,o,p[plan]);if(!change)return {ok:true};
 const configuration=await portalConfiguration(client,base);const session=await client.billingPortal.sessions.create({customer:o.stripe_customer_id,configuration,return_url:returnUrl,flow_data:{type:'subscription_update_confirm',subscription_update_confirm:change,after_completion:{type:'redirect',redirect:{return_url:returnUrl}}}});return {url:session.url};
 }
 const sessions:Stripe.Checkout.Session[]=[];for await(const s of client.checkout.sessions.list({customer:o.stripe_customer_id,status:'open',limit:100}))sessions.push(s);
 const {reuse,expire}=sessionActions(sessions,o.id,plan);for(const old of expire)await client.checkout.sessions.expire(old.id);if(reuse){const full=await client.checkout.sessions.retrieve(reuse.id,{expand:['line_items']});const item=full.line_items?.data[0];if(full.mode==='subscription'&&full.client_reference_id===o.id&&full.line_items?.data.length===1&&item?.price?.id===p[plan]&&item.quantity===1)return {url:reuse.url};await client.checkout.sessions.expire(reuse.id);}
 const price=await client.prices.retrieve(p[plan]);if(!price.active||price.recurring?.interval!=='month'||price.recurring.interval_count!==1)throw new AppError('This plan requires an active monthly Stripe price.',503);
 const session=await client.checkout.sessions.create({mode:'subscription',customer:o.stripe_customer_id,line_items:[{price:p[plan],quantity:1}],client_reference_id:o.id,metadata:{application:'maid-match',organization_id:o.id,plan},subscription_data:{metadata:{application:'maid-match',organization_id:o.id}},success_url:`${returnUrl}&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${base}/app?view=billing&billing=canceled&organization=${o.id}`},{idempotencyKey:`mm-checkout-${o.id}-${plan}-${lease}`});if(!session.url)throw new AppError('Stripe did not return a Checkout link.',502);return {url:session.url};
}
