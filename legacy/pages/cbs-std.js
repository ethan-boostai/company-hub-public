/*cbs-baked*/(function(){if(window.__cbsStd)return;window.__cbsStd=1;
(function(){var J=window.jspdf;if(!J||!J.jsPDF||J.jsPDF.__fb)return;var O=J.jsPDF;
function pl(v){return typeof v==="string"?v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014]/g,"-"):(Array.isArray(v)?v.map(pl):v);}
function W(){var a=[].slice.call(arguments),d=new (Function.prototype.bind.apply(O,[null].concat(a)))();["text","splitTextToSize","getTextWidth","getStringUnitWidth"].forEach(function(k){var f=d[k];if(typeof f!=="function")return;d[k]=function(){var g=[].slice.call(arguments);g[0]=pl(g[0]);return f.apply(d,g);};});return d;}
Object.keys(O).forEach(function(k){try{W[k]=O[k];}catch(e){}});W.API=O.API;W.prototype=O.prototype;W.__fb=1;J.jsPDF=W;})();
(function(){var s=document.createElement('style');s.textContent=".std-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-left:auto}\n.std-acts .std-b{font:inherit;font-size:14px!important;font-weight:600!important;border-radius:8px!important;padding:8px 12px!important;cursor:pointer;text-decoration:none!important;background:#fff!important;color:#1d1d1d!important;border:1px solid #d9d9d6!important;display:inline-block;white-space:nowrap}\n.std-acts .std-b.std-p,.std-acts .std-b.std-s:only-of-type{background:#F47920!important;color:#fff!important;border-color:#F47920!important}\n.std-acts .std-del{color:#b3261e!important;border-color:#d9d9d6!important}\n.std-acts .std-b:disabled{opacity:.55}\n.std-x{display:flex;gap:8px;flex-wrap:wrap;max-width:1100px;margin:8px auto 0;padding:0 14px}\n.std-bar{background:#3d4043!important;color:#fff!important;border-bottom:4px solid #F47920!important}.std-bar h1,.std-bar .sub,.std-bar b{color:#fff!important}.std-bar img{background:#fff;border-radius:3px}";document.head.appendChild(s);})();
(function(){var C=window.__CBS_HDR||{};function go(){var bar=document.querySelector(C.bar||".topbar,.top,header");if(!bar||bar.__std)return;bar.__std=1;bar.classList.add("std-bar");
var els=Array.prototype.slice.call(bar.querySelectorAll("a,button,label.btn")).filter(function(e){return e.closest(".topbar,.top,header")===bar;});
var S={hub:null,board:null,save:null,custom:null,pdf:null,del:null},X=[];
els.forEach(function(e){var t=(e.textContent||"").trim();if(!t)return;
 if(!S.hub&&e.tagName==="A"&&(/operations hub/i.test(t)||/\/webhook\/admin/.test(e.getAttribute("href")||"")))S.hub=e;else if(!S.board&&/board/i.test(t))S.board=e;
 else if(!S.del&&/^delete/i.test(t))S.del=e;else if(!S.pdf&&/pdf|download/i.test(t))S.pdf=e;
 else if(!S.custom&&C.custom&&new RegExp(C.custom,"i").test(t))S.custom=e;
 else if(!S.save&&/^save/i.test(t))S.save=e;else X.push(e);});
if(S.hub)S.hub.innerHTML="&#8249; Operations Hub";if(S.board)S.board.textContent="Return to Board";if(S.save)S.save.textContent="Save to Operations Hub";if(S.pdf)S.pdf.textContent="Download PDF";
if(!C.table&&S.hub){var mm=(S.hub.getAttribute("href")||"").match(/open=([a-z_]+)/);if(mm)C.table=mm[1];}
if(!S.del&&C.table){var d=document.createElement("button");d.type="button";d.className="btn";d.textContent="Delete";d.style.display="none";
 var cur=function(){return Number(new URLSearchParams(location.search).get("id")||0);};setInterval(function(){d.style.display=cur()?"":"none";},800);
 d.onclick=function(){var id=cur();if(!id)return;if(!confirm("Delete this record from the Operations Hub? This cannot be undone. Any PDF already saved stays in SharePoint and on the ServiceM8 job."))return;d.disabled=true;
  fetch("/webhook/cbs-admin-save?a=del&t="+C.table+"&id="+id,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(function(r){if(!r.ok)throw 0;location.href="/webhook/cbs-admin?open="+C.table;})["catch"](function(){d.disabled=false;alert("Could not delete. Check your connection and try again.");});};S.del=d;}
if(S.del)S.del.classList.add("std-del");if(!S.custom&&S.save)S.save.classList.add("std-p");
var w=document.createElement("div");w.className="std-acts";["hub","board","save","custom","pdf","del"].forEach(function(k){var e=S[k];if(!e)return;e.classList.add("std-b");if(k==="save"||k==="custom")e.classList.add(k==="custom"?"std-p":"std-s");w.appendChild(e);});bar.appendChild(w);
if(X.length){var x=document.createElement("div");x.className="std-x";X.forEach(function(e){x.appendChild(e);});bar.parentNode.insertBefore(x,bar.nextSibling);}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();setTimeout(go,600);})();
})();