// ==UserScript==
// @name         派單頁自動貼上（充提轉資訊整理）
// @namespace    arrange-row-formatter
// @version      1.0
// @description  接收「充/提/轉資訊整理」頁送來的帳號、訂單號、訊息，自動切換平台並填入派單頁欄位
// @match        *://*/*
// @noframes
// @grant        none
// @run-at       document-idle
// ==/UserScript==
// ↑ 建議把 @match 改成派單頁的網域，例如：// @match https://xxx.example.com/*

(function(){
  'use strict';
  // 只接受「開啟本頁的那個整理頁」送來的訊息
  const opener = window.opener;
  if(!opener) return;

  // 欄位 placeholder 關鍵字（簡繁都比對）
  const FIELDS = {
    member:  {name:'成员',     ph:['输入成员','輸入成員'],         switchPlat:true},
    order:   {name:'订单号',   ph:['输入订单号','輸入訂單號'],     switchPlat:true},
    message: {name:'文字讯息', ph:['文字讯息','文字訊息','文字信息'], switchPlat:false}
  };

  const sleep = ms => new Promise(r=>setTimeout(r, ms));
  const visible = e => !!(e.offsetParent || e.getClientRects().length);
  async function waitFor(fn, ms=3000){
    const end = Date.now() + ms;
    for(;;){ const v = fn(); if(v || Date.now() > end) return v; await sleep(100); }
  }

  // 左側選單：文字完全等於平台代碼、且最靠左的元素
  function platformEls(code){
    return [...document.querySelectorAll('body *')].filter(e=>
      visible(e) && e.textContent.trim() === code &&
      ![...e.children].some(c=>c.textContent.trim() === code))
      .sort((a,b)=>a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  }
  // 頁面標題（選單右邊也有同樣文字）= 目前所在平台
  const onPlatform = code => {
    const els = platformEls(code);
    return els.length > 1 && els[els.length-1].getBoundingClientRect().left - els[0].getBoundingClientRect().left > 60;
  };
  async function switchPlatform(code){
    if(!code || onPlatform(code)) return true;
    const nav = platformEls(code)[0];
    if(!nav) return false;
    (nav.closest('li,a,[role=menuitem]') || nav).click();
    await waitFor(()=>onPlatform(code));
    await sleep(300);
    return true;
  }

  const findField = phs => [...document.querySelectorAll('input,textarea')]
    .find(e=>visible(e) && !e.disabled && !e.readOnly && phs.some(p=>(e.placeholder||'').includes(p)));

  function setValue(el, v){
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);   // 讓 Vue/React 收到變更
    el.dispatchEvent(new Event('input', {bubbles:true}));
    el.dispatchEvent(new Event('change', {bubbles:true}));
    el.focus();
  }

  async function handle(d){
    const f = FIELDS[d.field];
    if(!f) return {ok:false, msg:'不認得的欄位'};
    if(f.switchPlat && !(await switchPlatform(d.platform)))
      return {ok:false, msg:'派單頁找不到平台 '+d.platform+'（已複製）'};
    const el = await waitFor(()=>findField(f.ph));
    if(!el) return {ok:false, msg: d.field==='message' ? '請先在派單頁點開一張派單（已複製）' : '派單頁找不到「'+f.name+'」欄位（已複製）'};
    setValue(el, d.value);
    return {ok:true};
  }

  let chain = Promise.resolve();
  window.addEventListener('message', e=>{
    if(e.source !== opener) return;
    const d = e.data || {};
    if(d.type !== 'arrange-fill') return;
    chain = chain.then(()=>handle(d)).catch(err=>({ok:false, msg:'貼上失敗：'+err.message}))
      .then(res=>opener.postMessage({type:'arrange-done', id:d.id, ...res}, '*'));
  });

  opener.postMessage({type:'arrange-ready'}, '*');
})();
