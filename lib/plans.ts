export const PLANS={starter:{name:'Starter',saved:20,members:3,aiDaily:5,features:['20 saved matches','3 family members','5 AI explanations / day','Interview planner']},pro:{name:'Pro',saved:100,members:10,aiDaily:25,features:['100 saved matches','10 family members','25 AI explanations / day','Shared notes & activity history']}} as const;
export type PlanId=keyof typeof PLANS;
export function isPlan(v:unknown):v is PlanId{return v==='starter'||v==='pro';}
export function prices(){const starter=process.env.STRIPE_STARTER_PRICE_ID||'',pro=process.env.STRIPE_PRO_PRICE_ID||'';if(!/^price_[A-Za-z0-9]+$/.test(starter)||!/^price_[A-Za-z0-9]+$/.test(pro)||starter===pro)throw Error('Configure distinct Starter and Pro Stripe price IDs.');return {starter,pro};}
export function planForPrice(price:string){const p=prices();return price===p.starter?'starter':price===p.pro?'pro':null;}
