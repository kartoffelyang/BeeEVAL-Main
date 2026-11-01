// A direct return to the Mini report list, independent of H5 browser history.
(()=>{
  const query=new URLSearchParams(location.search);
  const nested=query.get('path')||query.get('return')||'';
  if(query.get('beeeval_mini')!=='1'&&!/[?&]beeeval_mini=1(?:&|$)/.test(nested))return;
  if(document.getElementById('beeeval-mini-return'))return;
  const style=document.createElement('style');
  style.textContent='#beeeval-mini-return{position:fixed;right:16px;bottom:calc(22px + env(safe-area-inset-bottom));z-index:2147483647;background:#fbf8f1;color:#705322;border:1px solid #d8c39d;border-radius:24px;padding:12px 18px;box-shadow:0 3px 16px #30251526;font:600 14px/1.3 -apple-system,sans-serif;cursor:pointer}#beeeval-mini-return:focus-visible{outline:3px solid #9e762d}';document.head.append(style);
  const button=document.createElement('button');button.id='beeeval-mini-return';button.type='button';button.textContent='← 返回报告列表';document.body.append(button);
  let loading;
  function sdk(){if(window.wx&&wx.miniProgram)return Promise.resolve();if(loading)return loading;loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://res.wx.qq.com/open/js/jweixin-1.6.0.js';script.onload=resolve;script.onerror=reject;document.head.append(script);}).catch(error=>{loading=undefined;throw error;});return loading;}
  button.onclick=async()=>{button.disabled=true;try{await sdk();if(!window.wx||!wx.miniProgram)throw Error();wx.miniProgram.navigateBack({delta:1,fail(){wx.miniProgram.reLaunch({url:'/pages/index/index?tab=reports'});}});}catch(_){button.textContent='请点微信左上角返回';}finally{button.disabled=false;}};
  // Keep the return control when switching between reports in this reader.
  document.addEventListener('click',event=>{const link=event.target.closest&&event.target.closest('a[href]');if(!link)return;try{const url=new URL(link.href,location.href);if(url.origin===location.origin&&url.pathname.startsWith('/reports/')){url.searchParams.set('beeeval_mini','1');link.href=url.href;}}catch(_){}});
})();
