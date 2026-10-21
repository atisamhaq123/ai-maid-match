export const SKILLS=['Cleaning','Cooking','Laundry','Childcare','Elderly assistance','Pet care'] as const;
export const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
export type Brief={location:string;budget:number;currency:'USD'|'PKR'|'AED';schedule:string[];skills:string[];hours:number;arrangement:'live-out'|'live-in';startDate:string;householdSize:number;languages:string[]};
export type Maid={photo_url?:string|null;id:string;name:string;location:string;rate:number;currency:string;skills:string[];languages:string[];days:string[];hours:number;arrangement:string;experience:number;bio:string;available:boolean;consent:boolean};
export type Saved={maid_id:string;status:'saved'|'interview'|'hired'|'closed';interview_at:string|null;note:string;version:number};
export type Organization={id:string;name:string;brief:Brief;version:number;plan:'starter'|'pro';subscription_status:string;trial_end:string;period_end:string|null;cancel_at_period_end:boolean;stripe_subscription_id:string|null};
export type Match={id:string;score:number;reasons:string[];gaps:string[]};
export const emptyBrief:Brief={location:'',budget:0,currency:'USD',schedule:['Mon','Tue','Wed','Thu','Fri'],skills:['Cleaning'],hours:8,arrangement:'live-out',startDate:'',householdSize:2,languages:[]};
export function activePlan(o:Organization,now=Date.now()){return (['active','trialing'].includes(o.subscription_status)&&!!o.period_end&&Date.parse(o.period_end)>now)||(!o.stripe_subscription_id&&o.subscription_status==='trial'&&Date.parse(o.trial_end)>now);}
export function matching(brief:Brief,maids:Maid[]):Match[]{
 return maids.filter(m=>m.available&&m.consent).map(m=>{
 const reasons:string[]=[],gaps:string[]=[];let points=0,total=0;
 const measure=(ok:boolean,weight:number,yes:string,no:string)=>{total+=weight;if(ok){points+=weight;reasons.push(yes);}else gaps.push(no);};
 for(const skill of brief.skills)measure(m.skills.includes(skill),20,`${skill} experience`,`${skill} needs discussion`);
 if(brief.location.trim())measure(m.location.toLowerCase().trim()===brief.location.toLowerCase().trim(),20,'Same service area','Confirm travel to your area');
 if(brief.budget>0)measure(m.currency===brief.currency&&m.rate<=brief.budget,20,'Within monthly budget',m.currency!==brief.currency?'Different currency; compare pay directly':'Expected pay exceeds budget');
 for(const day of brief.schedule)measure(m.days.includes(day),4,`${day} available`,`${day} availability differs`);
 measure(m.arrangement===brief.arrangement,10,'Living arrangement aligns','Living arrangement differs');
 measure(m.hours>=brief.hours,10,'Daily hours align','Daily hours need discussion');
 for(const lang of brief.languages)measure(m.languages.includes(lang),5,`${lang} communication`,`${lang} needs confirmation`);
 return {id:m.id,score:Math.round(points/Math.max(total,1)*100),reasons,gaps};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function uuid(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
export function validateBrief(v:unknown):Brief{
 const b=v as Brief;const text=(x:unknown,n:number)=>typeof x==='string'&&x.length<=n;
 if(!b||!text(b.location,100)||!b.location.trim()||!Number.isFinite(b.budget)||b.budget<=0||b.budget>10000000||!['USD','PKR','AED'].includes(b.currency)||!Number.isInteger(b.hours)||b.hours<1||b.hours>16||!Number.isInteger(b.householdSize)||b.householdSize<1||b.householdSize>30||!['live-in','live-out'].includes(b.arrangement)||!Array.isArray(b.skills)||!b.skills.length||b.skills.length>6||b.skills.some(s=>!SKILLS.includes(s as typeof SKILLS[number]))||new Set(b.skills).size!==b.skills.length||!Array.isArray(b.schedule)||!b.schedule.length||b.schedule.length>7||b.schedule.some(s=>!DAYS.includes(s as typeof DAYS[number]))||new Set(b.schedule).size!==b.schedule.length||!Array.isArray(b.languages)||b.languages.length>5||b.languages.some(s=>!text(s,40)||!s.trim())||!text(b.startDate,10)||(b.startDate!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(b.startDate)||(Number.isNaN(Date.parse(b.startDate))||new Date(b.startDate).toISOString().slice(0,10)!==b.startDate))))throw Error('Check your household requirements. Location, positive budget, skills, and working days are required.');
 return {location:b.location.trim(),budget:b.budget,currency:b.currency,hours:b.hours,householdSize:b.householdSize,arrangement:b.arrangement,skills:b.skills,schedule:b.schedule,languages:b.languages.map(s=>s.trim()),startDate:b.startDate};
}
