import type {Maid,Organization,Saved} from './domain.ts';
export type WorkspaceState={organizations:Organization[];memberships:{organization_id:string;role:string}[];selected:string;maids:Maid[];saved:Saved[];audit:{id:string;event:string;created_at:string}[];members:{user_id:string;role:string}[];invitations:{id:string;email:string;expires_at:string;revoked:boolean;accepted_at:string|null}[];usage:number;user:{id:string;email:string}};

/** Keep initial onboarding and populated workspaces on the same response contract. */
export function workspaceState(input:Partial<WorkspaceState>):WorkspaceState{
 return {
  organizations:Array.isArray(input.organizations)?input.organizations:[],
  memberships:Array.isArray(input.memberships)?input.memberships:[],
  selected:typeof input.selected==='string'?input.selected:'',
  maids:Array.isArray(input.maids)?input.maids:[],
  saved:Array.isArray(input.saved)?input.saved:[],
  audit:Array.isArray(input.audit)?input.audit:[],
  members:Array.isArray(input.members)?input.members:[],
  invitations:Array.isArray(input.invitations)?input.invitations:[],
  usage:typeof input.usage==='number'&&Number.isFinite(input.usage)?input.usage:0,
  user:input.user||{id:'',email:''}
 };
}
