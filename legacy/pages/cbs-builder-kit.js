/*cbs-baked*/(function(){var C=window.__CBS_PV||{};if(window.__cbsPvOn)return;window.__cbsPvOn=1;var CROP={prestart:[27,14]};if(CROP[C.doc]&&C.cropTop==null){C.cropTop=CROP[C.doc][0];C.cropBottom=CROP[C.doc][1];}
var PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",QRJS="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
function load(src){return new Promise(function(res,rej){var s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function $(s){return document.querySelector(s);}
function wide(){return window.matchMedia("(min-width:1100px)").matches;}
/* ---------- html2canvas trap: lets the page render its own PDF from the real pages ---------- */
(function(){function wrap(f){if(!f||f.__cbs)return f;var g=function(){var b=document.body;b.classList.add("cbs-render");var p;try{p=f.apply(this,arguments);}catch(e){b.classList.remove("cbs-render");throw e;}return Promise.resolve(p).then(function(r){b.classList.remove("cbs-render");return r;},function(e){b.classList.remove("cbs-render");throw e;});};for(var k in f)try{g[k]=f[k];}catch(e){}g.__cbs=1;return g;}
 var cur=wrap(window.html2canvas);try{Object.defineProperty(window,"html2canvas",{configurable:true,get:function(){return cur;},set:function(v){cur=wrap(v);}});}catch(e){}})();
/* ---------- work out the page structure ---------- */
var top0=$(".topbar")||$("header");
var MODE=$("#doc")||document.getElementById("doc")?"pages":(document.getElementById("prev")?"native":"pdf");
var grid=null,formCol=null,pvCol=null;
function setup(){
 if($(".layout")&&$(".panel")){grid=$(".layout");formCol=$(".panel");pvCol=$(".previewWrap");}
 else if($("main.wrap")&&document.getElementById("form")){grid=$("main.wrap");formCol=document.getElementById("form");pvCol=document.getElementById("prev");}
 else{var m=$("main")||$(".wrap");if(!m)return false;grid=document.createElement("div");m.parentNode.insertBefore(grid,m);grid.appendChild(m);formCol=m;}
 if(!pvCol){pvCol=document.getElementById("cbsPv");if(!pvCol){pvCol=document.createElement("div");pvCol.id="cbsPv";pvCol.innerHTML="<div id='cbsPvNote'></div><div id='cbsPvPages'></div>";}grid.appendChild(pvCol);MODE="pdf";}
 grid.classList.add("eg");formCol.classList.add("eg-form");pvCol.classList.add("eg-pv");document.body.classList.add("eg-on","eg-"+MODE);return true;}
var css=document.createElement("style");css.id="cbsKitCss";css.textContent=[
".topbar{background:#3d4043!important;color:#fff!important;position:sticky!important;top:0!important;z-index:5000!important;border-bottom:3px solid #F47920!important}.topbar h1{color:#fff!important}.topbar .sub{color:#c9c6c0!important}.topbar .btn{background:#fff!important;color:#1d1d1d!important;border:1px solid #d9d9d6!important;text-decoration:none!important}.topbar .btn.primary{background:#F47920!important;color:#fff!important;border-color:#F47920!important;font-weight:600}",
".eg{box-sizing:border-box!important;width:100%!important;max-width:760px!important;margin:0 auto!important;padding:12px!important}",
".eg-form,.eg-pv{min-width:0!important;box-sizing:border-box}",
"#cbsTabs{display:flex;gap:8px;max-width:760px;margin:8px auto 0;padding:0 12px;box-sizing:border-box}#cbsTabs button{flex:1;padding:9px;border:1px solid #d9d9d6;border-radius:6px;background:#f7f7f6;font:inherit;font-size:13px;cursor:pointer}#cbsTabs button[aria-selected=true]{background:#F47920;color:#fff;border-color:#F47920;font-weight:600}",
"body.eg-pdf .eg-pv{display:none}body.eg-pdf.cbs-pv .eg-pv{display:block}body.eg-pdf.cbs-pv .eg-form{display:none!important}",
"#cbsPvNote{color:#6b6e70;font-size:13px;margin:0 0 8px}#cbsPvNote:empty{display:none}",
"#cbsPvPages,#cbsSheet{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.15),0 8px 24px rgba(0,0,0,.06);margin:0 0 18px;overflow:hidden}",
"#cbsPvPages canvas{display:block;width:100%;height:auto;margin:0;box-shadow:none}",
"#cbsSheet>.page{width:210mm!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;margin:0!important;display:block!important;box-shadow:none!important;transform:none!important}#cbsSheet>.page>*{flex:none!important;max-height:none!important}",
"body.eg-pages #doc{height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important}",
"body.eg-pages.cbs-render #doc,body.eg-pages.rendering #doc{height:auto!important;overflow:visible!important}",
"body.eg-pages .zoombar{display:none!important}",
"@media(min-width:1100px){",
" .eg{max-width:1500px!important;padding:12px 24px 40px!important;display:grid!important;grid-template-columns:minmax(520px,640px) minmax(0,1fr)!important;gap:24px!important;align-items:start!important;min-height:0!important}",
" .eg-form{display:block!important;width:auto!important;max-width:none!important;flex:none!important;position:static!important;max-height:none!important;overflow:visible!important;border:0!important;padding:0!important;margin:0!important;background:transparent!important}",
" .eg-pv{display:block!important;position:sticky!important;top:calc(var(--cbs-top,60px) + 12px)!important;max-height:calc(100vh - var(--cbs-top,60px) - 24px)!important;overflow:auto!important;padding:0!important;margin:0!important;width:auto!important;flex:none!important;background:transparent!important;border:0!important}",
" body.eg-on .tabs,#cbsTabs{display:none!important}",
" #statusLine,#cbsSign{max-width:1500px!important;padding-left:24px!important;padding-right:24px!important;box-sizing:border-box}",
"}"].join("\n");document.head.appendChild(css);
function topH(){var t=$(".topbar")||$("header");if(t)document.documentElement.style.setProperty("--cbs-top",t.offsetHeight+"px");}
setInterval(topH,1000);window.addEventListener("resize",topH);
function note(t){var n=document.getElementById("cbsPvNote");if(n)n.textContent=t;}
/* ---------- continuous sheet for builders with A4 page previews ---------- */
function sheetInit(){var T2=null;
 function build(){var d=document.getElementById("doc");if(!d)return;var pages=d.querySelectorAll(".page"),sh=document.getElementById("cbsSheet");
  if(!sh){sh=document.createElement("div");sh.id="cbsSheet";d.parentNode.insertBefore(sh,d.nextSibling);}
  if(!pages.length){sh.style.display="none";return;}sh.style.display="";
  var pg=document.createElement("div");pg.className="page";var n=pages.length;
  for(var i=0;i<n;i++){Array.prototype.forEach.call(pages[i].children,function(ch){if(ch.classList.contains("phead")&&i>0)return;if(ch.classList.contains("pfoot")&&i<n-1)return;var cl=ch.cloneNode(true);var a=ch.querySelectorAll("canvas"),b=cl.querySelectorAll("canvas");for(var k=0;k<a.length&&k<b.length;k++){try{b[k].width=a[k].width;b[k].height=a[k].height;b[k].getContext("2d").drawImage(a[k],0,0);}catch(e){}}
   if(cl.removeAttribute)cl.removeAttribute("id");Array.prototype.forEach.call(cl.querySelectorAll("[id]"),function(x){x.removeAttribute("id");});pg.appendChild(cl);});}
  sh.innerHTML="";sh.appendChild(pg);fit();}
 function fit(){var sh=document.getElementById("cbsSheet");if(!sh||!sh.firstChild)return;var pg=sh.firstChild;pg.style.zoom="1";var w=pg.offsetWidth||794,cw=sh.clientWidth||pvCol.clientWidth||w;pg.style.zoom=String(Math.min(1.25,cw/w));}
 var mo=new MutationObserver(function(m){if(m.every(function(x){var t=x.target;return t&&t.closest&&t.closest("#cbsSheet");}))return;clearTimeout(T2);T2=setTimeout(build,150);});
 function watch(){var d=document.getElementById("doc");if(!d){setTimeout(watch,300);return;}mo.observe(d,{childList:true,subtree:true,characterData:true,attributes:true});build();}
 watch();window.addEventListener("resize",function(){clearTimeout(T2);T2=setTimeout(fit,100);});setInterval(fit,1500);}
/* ---------- live PDF preview for builders that only make a PDF ---------- */
function pdfInit(){var tabs=document.createElement("div");tabs.id="cbsTabs";tabs.innerHTML="<button type='button' id='cbsTabE' aria-selected='true'>Edit</button><button type='button' id='cbsTabP' aria-selected='false'>Preview</button>";
 var a=document.getElementById("statusLine")||top0;if(a&&a.parentNode)a.parentNode.insertBefore(tabs,a.nextSibling);
 function showTab(p){document.body.classList.toggle("cbs-pv",!!p);document.getElementById("cbsTabE").setAttribute("aria-selected",p?"false":"true");document.getElementById("cbsTabP").setAttribute("aria-selected",p?"true":"false");window.scrollTo(0,0);if(p)refresh();}
 document.getElementById("cbsTabE").onclick=function(){showTab(false);};document.getElementById("cbsTabP").onclick=function(){showTab(true);};
 window.addEventListener("resize",function(){if(wide()){document.body.classList.remove("cbs-pv");soon();}});
 var capturing=false;
 function capture(){return new Promise(function(res,rej){var btn=document.getElementById("pdfBtn")||Array.prototype.filter.call(document.querySelectorAll("button,a"),function(b){return /pdf/i.test(b.textContent||"")&&!(b.closest&&b.closest("#cbsSign,#cbsPv,.eg-pv"));})[0];if(!btn)return rej(new Error("no pdf"));
  var U=window.URL,oCOU=U.createObjectURL,oClick=HTMLAnchorElement.prototype.click,oDisp=HTMLAnchorElement.prototype.dispatchEvent,oAlert=window.alert,oConfirm=window.confirm,oOpen=window.open,blob=null,done=false,msg="";
  function fin(err){if(done)return;done=true;U.createObjectURL=oCOU;HTMLAnchorElement.prototype.click=oClick;HTMLAnchorElement.prototype.dispatchEvent=oDisp;window.alert=oAlert;window.confirm=oConfirm;window.open=oOpen;clearInterval(iv);clearTimeout(to);capturing=false;
   if(blob)blob.arrayBuffer().then(res,rej);else rej(new Error(msg||(err&&err.message)||"none"));}
  function fromHref(h){h=String(h||"");if(!blob&&/^data:application\/pdf/.test(h)){try{var b=atob(h.split(",")[1]),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);blob=new Blob([u],{type:"application/pdf"});}catch(e){}}}
  function grab(a){if(a&&(a.download||/^(blob|data):/.test(a.href||""))){fromHref(a.href);fin();return true;}return false;}
  capturing=true;
  U.createObjectURL=function(b){if(b&&b.size&&(!blob||/pdf/.test(b.type||"")))blob=b;return oCOU.apply(U,arguments);};
  HTMLAnchorElement.prototype.click=function(){if(grab(this))return;return oClick.apply(this,arguments);};
  HTMLAnchorElement.prototype.dispatchEvent=function(e){if(e&&e.type==="click"&&grab(this))return true;return oDisp.apply(this,arguments);};
  window.alert=function(m){msg=String(m||"");fin();};window.confirm=function(){return false;};window.open=function(u){fromHref(u);fin();return null;};
  var iv=setInterval(function(){if(blob)setTimeout(fin,50);},150),to=setTimeout(function(){fin(new Error("timeout"));},15000);
  try{btn.click();}catch(e){fin(e);}});}
 function getPdfjs(){if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);return load(PDFJS).then(function(){window.pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;return window.pdfjsLib;});}
 function draw(buf){return getPdfjs().then(function(lib){return lib.getDocument({data:new Uint8Array(buf)}).promise;}).then(function(doc){var box=document.getElementById("cbsPvPages"),w=Math.max(320,Math.min(box.clientWidth||700,1100)),dpr=Math.min(2,window.devicePixelRatio||1),jobs=[],n=doc.numPages,cT=+C.cropTop||0,cB=+C.cropBottom||0;
  for(var i=1;i<=n;i++)jobs.push(doc.getPage(i).then(function(pg){var i0=pg.pageNumber,v=pg.getViewport({scale:1}),sc=(w*dpr)/v.width,vp=pg.getViewport({scale:sc}),c=document.createElement("canvas");c.width=Math.round(vp.width);c.height=Math.round(vp.height);
   return pg.render({canvasContext:c.getContext("2d"),viewport:vp}).promise.then(function(){var mm=vp.height/297,t=i0>1?Math.round(cT*mm):0,b=i0<n?Math.round(cB*mm):0;if(!t&&!b)return c;var o=document.createElement("canvas");o.width=c.width;o.height=c.height-t-b;o.getContext("2d").drawImage(c,0,t,c.width,o.height,0,0,c.width,o.height);return o;});}));
  return Promise.all(jobs).then(function(cs){box.innerHTML="";cs.forEach(function(c){box.appendChild(c);});});});}
 var busy=false,again=false,T=null;
 function visible(){return document.body.classList.contains("cbs-pv")||wide();}
 function soon(){clearTimeout(T);T=setTimeout(refresh,1300);}
 function refresh(){if(!visible())return;if(busy){again=true;return;}busy=true;note("Updating preview\u2026");
  capture().then(draw).then(function(){note("");},function(e){note(e&&e.message&&!/^(none|timeout|no pdf)$/.test(e.message)?"Preview not ready: "+e.message:"Fill in the form to see the preview.");}).then(function(){busy=false;if(again){again=false;soon();}});}
 window.cbsPreviewRefresh=refresh;
 ["input","change"].forEach(function(t){document.addEventListener(t,function(e){if(e.isTrusted&&!capturing)soon();},true);});
 document.addEventListener("click",function(e){if(!e.isTrusted||capturing)return;var t=e.target;if(t&&t.closest&&(t.closest(".eg-pv")||t.closest("#cbsTabs")||t.closest("#cbsSign")||t.closest("#pdfBtn")||/pdf/i.test(t.textContent||"")&&t.closest("button,a")))return;soon();},true);
 setTimeout(refresh,1800);}
function start(){if(!setup()){setTimeout(start,300);return;}topH();if(MODE==="pages")sheetInit();else if(MODE==="pdf")pdfInit();}
start();
/* ---------- crew sign-on (compact bar + big QR) ---------- */
var css2=document.createElement("style");css2.textContent="#cbsSign{max-width:760px;margin:10px auto 0;padding:0 12px;box-sizing:border-box;font-size:14px}#cbsSign .es-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#fff;border:1px solid #d9d9d6;border-radius:10px;padding:10px 12px}#cbsSign .es-bar b{margin-right:2px}#esCount{color:#6b6e70;font-size:13px;flex:1;min-width:120px}#cbsSign button{border:1px solid #111;background:#fff;color:#111;border-radius:6px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}#cbsSign button.qr{background:#F47920;color:#fff;border-color:#F47920;font-weight:600}#esOv{position:fixed;inset:0;z-index:6000;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font-family:inherit}#esOv h2{margin:0;font-size:22px}#esOv p{margin:0;color:#444;font-size:15px;max-width:420px}#esOvQr{background:#fff;padding:12px;border:6px solid #F47920;border-radius:12px}#esOvQr img,#esOvQr canvas{width:min(78vw,60vh,420px)!important;height:auto!important;display:block}#esOv small{color:#6b6e70;word-break:break-all;font-size:12px}#esOv button{border:0;background:#F47920;color:#fff;border-radius:8px;padding:12px 28px;font:inherit;font-size:16px;font-weight:600;cursor:pointer}";document.head.appendChild(css2);
function recId(){var q=new URLSearchParams(location.search);return Number(window.__cbsRecId||q.get("id")||0);}
var of=window.fetch;window.fetch=function(u,o){var p=of.apply(this,arguments);if(C.save&&String(u).indexOf(C.save)>-1){p.then(function(r){try{r.clone().json().then(function(j){if(j&&j.id){window.__cbsRecId=j.id;signPanel();}})["catch"](function(){});}catch(e){}},function(){});}return p;};
function signUrl(){return location.origin+"/webhook/cbs-sign?doc="+C.doc+"&id="+recId();}
function copyText(t){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t);var i=document.createElement("textarea");i.value=t;document.body.appendChild(i);i.select();try{document.execCommand("copy");}catch(e){}document.body.removeChild(i);return Promise.resolve();}
function showQr(){var url=signUrl(),ov=document.getElementById("esOv");if(ov)ov.remove();ov=document.createElement("div");ov.id="esOv";ov.innerHTML="<h2>Crew sign-on</h2><p>Scan with your phone camera to read the "+esc(C.label||"document")+" and sign on.</p><div id='esOvQr'>Loading\u2026</div><small>"+esc(url)+"</small><button type='button' id='esOvClose'>Close</button>";document.body.appendChild(ov);document.getElementById("esOvClose").onclick=function(){ov.remove();};
 load(QRJS).then(function(){var q=document.getElementById("esOvQr");if(q&&window.QRCode){q.innerHTML="";new window.QRCode(q,{text:url,width:600,height:600,correctLevel:window.QRCode.CorrectLevel.M});}})["catch"](function(){var q=document.getElementById("esOvQr");if(q)q.textContent="Could not load the QR code. Use Copy link instead.";});}
function signPanel(){var id=recId(),box=document.getElementById("cbsSign");if(!id){if(box)box.style.display="none";return;}
 if(!box){box=document.createElement("div");box.id="cbsSign";var a=document.getElementById("cbsTabs")||document.getElementById("statusLine")||document.querySelector(".tabs")||document.querySelector(".topbar,header");if(a&&a.parentNode)a.parentNode.insertBefore(box,a.nextSibling);else document.body.insertBefore(box,document.body.firstChild);
  box.innerHTML="<div class='es-bar'><b>Crew sign-on</b><span id='esCount'></span><button type='button' class='qr' id='esQrBtn'>Show QR code</button><button type='button' id='esCopy'>Copy link</button></div>";
  document.getElementById("esQrBtn").onclick=showQr;
  document.getElementById("esCopy").onclick=function(){var b=this;copyText(signUrl()).then(function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy link";},1500);});};}
 box.style.display="";loadList(id);}
function loadList(id){of("/webhook/cbs-admin-data?t=signons").then(function(r){return r.json();}).then(function(d){var L=((d&&d.signons)||[]).filter(function(s){return s.doc_type===C.doc&&String(s.doc_id)===String(id);});var ct=document.getElementById("esCount");if(ct)ct.textContent=L.length?L.length+" signed":"Nobody signed yet";})["catch"](function(){});}
if(C.doc){signPanel();setInterval(function(){var id=recId();if(id){if(!document.getElementById("cbsSign"))signPanel();else loadList(id);}},60000);setInterval(function(){if(recId()&&(!document.getElementById("cbsSign")||document.getElementById("cbsSign").style.display==="none"))signPanel();},2000);}
})();
