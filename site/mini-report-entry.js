(async()=>{
 const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');
 history.replaceState(null,'',location.pathname+location.search);
 const status=document.getElementById('report-status');
 if(!ticket){status.textContent='阅读会话无效，请返回报告列表重新打开。';return;}
 try{
  const response=await fetch('/api/mini/report-session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'报告会话暂时不可用');
  if(typeof result.url!=='string'||!/^\/reports\/[a-z0-9-]+\/\?beeeval_mini=1$/.test(result.url))throw Error('报告地址无效');
  location.replace(result.url);
 }catch(error){status.textContent=error.message+'。请使用右下角按钮返回后重试。';}
})();
