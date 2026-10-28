import {readFileSync} from 'node:fs';
const scenes=JSON.parse(readFileSync(new URL('./mini-scenes.json',import.meta.url)));
export function createMiniContent({remote,token,capabilities}){
 return async(req,route,url,send)=>{
  if(req.method!=='GET')return send(405,{error:'请使用 GET 请求'});
  const value=token(req);if(!value)return send(401,{error:'请先登录'});
  const headers={Authorization:'Bearer '+value};
  if(route==='/api/mini/scenes'){
   if(url.search)return send(403,{error:'请通过场景库首页浏览'});
   const r=await remote('me',{headers});if(!r.ok)return send(r.status,{error:'登录已失效'});
   const user=await r.json(),full=capabilities(user).scenarios;
   return send(200,{...scenes,scenes:full?scenes.scenes:scenes.scenes.slice(0,12),preview:!full});
  }
  const target=route==='/api/mini/preview-case'?'mini-preview-case':'mini-preview-vehicle';
  const r=await remote(target+url.search,{headers}),body=await r.json();
  return send(r.status,r.ok?body:{error:typeof body.detail==='string'?body.detail:'读取暂时失败'});
 };
}
