 'use client';
import {useEffect,useRef,useState} from 'react';
import type {Maid} from '../lib/domain';
export default function MaidPortrait({maid,detail=false}:{maid:Maid;detail?:boolean}){
 const [failed,setFailed]=useState<string|null>(null);
 const source=maid.photo_url?.replace(/^(\/maids\/sample-[a-z]+)\.svg$/, '$1.jpg');
 const image=useRef<HTMLImageElement>(null);
 // An image can fail before React hydrates and attaches its error listener.
 useEffect(()=>{if(image.current?.complete&&image.current.naturalWidth===0)setFailed(source||null);},[source]);
 // Bundled same-origin portraits work with the app's existing CSP.
 const valid=typeof source==='string'&&/^\/maids\/[a-z0-9-]+\.(svg|png|webp|jpe?g)$/i.test(source);
 if(!valid||failed===source)return <span className={detail?'avatar large':'profile-abstract'}>{maid.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span>;
 return <span className={'maid-portrait'+(detail?' portrait-detail':'')}><img ref={image} src={source} alt={source.includes('/sample-')?'Stock photo for fictional profile '+maid.name:'Profile photo of '+maid.name} width={480} height={320} loading={detail?'eager':'lazy'} onError={()=>setFailed(source)}/>{source.includes('/sample-')&&!detail&&<small className="stock-photo-label">Stock photo / demo</small>}</span>;
}
