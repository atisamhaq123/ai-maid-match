import './globals.css';
export const dynamic='force-dynamic';
export const metadata={title:{default:'Maid-Match · A little help. A happier home.',template:'%s · Maid-Match'},description:'Find household help that fits your family. Thoughtful matches, shared decisions, and a calmer everyday.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
