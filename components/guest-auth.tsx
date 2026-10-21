import {redirect} from 'next/navigation';
import {identity,AppError} from '../lib/server';
import {safeNext} from '../lib/navigation';
import AuthForm from './auth-form';

export default async function GuestAuth({mode,searchParams}:{mode:'login'|'signup';searchParams:Promise<Record<string,string|string[]|undefined>>}){
 try{
  await identity();
 }catch(error){
  // Invalid, missing, or unverified sessions must still be able to sign in.
  if(error instanceof AppError&&error.status===401)return <AuthForm mode={mode}/>;
  throw error;
 }
 const query=await searchParams;
 const destination=safeNext(query.next);
 // Preserve email-bound family invitations, without reopening password recovery.
 redirect(destination==='/reset-password'?'/app':destination);
}
