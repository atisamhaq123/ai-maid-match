import {planForPrice} from './plans.ts';
export const blockingStatuses=['active','trialing','past_due','unpaid','paused','incomplete'];
export function selectSubscription(subscriptions:any[],org:{id:string;stripe_subscription_id:string|null},preferred?:string){
 if(subscriptions.some(s=>blockingStatuses.includes(s.status)&&(s.metadata?.application!=='maid-match'||s.metadata?.organization_id!==org.id)))throw Error('This Stripe customer contains an unrelated subscription. Review it in Stripe.');
 const mapped=subscriptions.filter(s=>s.metadata?.application==='maid-match'&&s.metadata?.organization_id===org.id);
 const blocking=mapped.filter(s=>blockingStatuses.includes(s.status));if(blocking.length>1)throw Error('Multiple active or blocking subscriptions exist. Review them in Stripe before continuing.');
 if(preferred&&!mapped.some(s=>s.id===preferred))throw Error('Checkout subscription does not belong to this family.');
 return blocking[0]||mapped.find(s=>s.id===org.stripe_subscription_id)||mapped.find(s=>s.id===preferred)||mapped.sort((a,b)=>b.created-a.created)[0]||null;
}
export function validateSubscription(s:any,org:{id:string;stripe_customer_id:string|null}){
 const customer=typeof s.customer==='string'?s.customer:s.customer?.id;
 if(customer!==org.stripe_customer_id||s.metadata?.application!=='maid-match'||s.metadata?.organization_id!==org.id)throw Error('Stripe customer or family metadata mismatch.');
 const item=s.items?.data?.[0];if(s.items?.data?.length!==1||!item||item.quantity!==1)throw Error('Unexpected subscription item configuration.');
 const plan=planForPrice(item.price.id);if(!plan)throw Error('Subscription price is not configured for Maid-Match.');
 if(![...blockingStatuses,'canceled','incomplete_expired'].includes(s.status))throw Error('Unsupported subscription status.');
 if(!Number.isFinite(item.current_period_start)||!Number.isFinite(item.current_period_end)||item.current_period_end<=item.current_period_start)throw Error('Invalid subscription period.');
 return {item,plan,customer};
}
export function validateCheckout(s:any,org:{id:string;stripe_customer_id:string|null}){const customer=typeof s.customer==='string'?s.customer:s.customer?.id;if(s.mode!=='subscription'||customer!==org.stripe_customer_id||s.client_reference_id!==org.id||s.metadata?.application!=='maid-match'||s.metadata?.organization_id!==org.id)throw Error('Checkout session does not belong to this family.');return typeof s.subscription==='string'?s.subscription:s.subscription?.id;}
export function sessionActions(sessions:any[],org:string,plan:string){const owned=sessions.filter(s=>s.metadata?.application==='maid-match'&&s.metadata?.organization_id===org);return {reuse:owned.find(s=>s.metadata?.plan===plan&&s.url),expire:owned.filter(s=>s.metadata?.plan!==plan)};}

export function planChange(subscription:any,org:{id:string;stripe_customer_id:string|null},targetPrice:string){const {item}=validateSubscription(subscription,org);if(!['active','trialing'].includes(subscription.status))throw Error('Resolve the existing subscription in the customer portal.');return item.price.id===targetPrice?null:{subscription:subscription.id,items:[{id:item.id,price:targetPrice,quantity:1}]};}
