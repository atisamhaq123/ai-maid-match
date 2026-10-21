import GuestAuth from '../../components/guest-auth';
export default function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <GuestAuth mode="signup" searchParams={searchParams}/>;}
