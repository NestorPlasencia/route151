'use client';
import {useLayoutEffect,useRef,type ReactNode} from 'react';
export function Modal({label,className='modal',onClose,children,dismissBackdrop=true}:{label:string;className?:string;onClose:()=>void;children:ReactNode;dismissBackdrop?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);
 close.current=onClose;
 useLayoutEffect(()=>{
  const dialog=ref.current!;
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const cancel=(event:Event)=>{event.preventDefault();event.stopPropagation();close.current()};
  const click=(event:MouseEvent)=>{
   if(!dismissBackdrop||event.target!==dialog)return;
   const box=dialog.getBoundingClientRect();
   if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close.current();
  };
  dialog.addEventListener('cancel',cancel);dialog.addEventListener('click',click);dialog.showModal();
  dialog.querySelector<HTMLElement>('[data-dialog-focus]')?.focus();
  return()=>{
   dialog.removeEventListener('cancel',cancel);
   dialog.removeEventListener('click',click);
   if(dialog.open)dialog.close();
   if(previous?.isConnected)previous.focus({preventScroll:true});
  };
 },[dismissBackdrop]);
 return <dialog ref={ref} className={className} aria-label={label}>{children}</dialog>;
}
