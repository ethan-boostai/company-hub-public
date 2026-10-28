(function(G){
var K='#000',S=' fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
function dots(pts,r){return pts.map(function(p){return '<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(p[2]||r)+'" fill="#000"/>';}).join('');}
function man(x,y,s){s=s||1;return '<circle cx="'+x+'" cy="'+y+'" r="'+4.5*s+'" fill="#000"/>';}
var P={
height:'<path d="M18 80H50"'+S+'/><path d="M50 80V72"'+S+'/>'+man(64,46)+'<path d="M62 52L58 66M58 66L52 64M58 66L66 72M60 56L70 54"'+S+'/><path d="M74 62V78M70 74L74 79L78 74"'+S+'/>',
ladder:'<path d="M38 82L46 40M62 82L54 40M40 72H60M42 61H58M44 50H56"'+S+'/>',
dust:'<path d="M60 84V74Q68 74 68 68V62L72 60L68 54Q68 40 56 38Q44 38 42 50Q40 60 46 66V84Z" fill="#000"/>'+dots([[30,54],[36,60],[28,64],[34,70],[24,72],[38,48],[30,78]],2.4),
soot:dots([[50,48],[42,56],[58,56],[34,64],[50,64],[66,64],[28,74],[42,72],[58,72],[72,74],[36,80],[50,80],[64,80]],3.2),
asbestos:'<text x="50" y="80" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="40" fill="#000">a</text>',
fire:'<path d="M50 84C36 84 31 74 34 64C36 57 42 54 41 44C49 49 52 56 51 62C55 58 56 53 55 49C65 56 69 66 66 74C63 81 57 84 50 84Z" fill="#000"/>',
gasfume:'<path d="M30 74Q28 60 42 60Q46 48 58 54Q72 52 70 66Q76 76 64 78H36Q28 78 30 74Z"'+S+'/><text x="51" y="73" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14" fill="#000">CO</text>',
lifting:man(46,44)+'<path d="M46 50V66M46 66L40 80M46 66L52 80M46 55L58 62"'+S+'/><rect x="56" y="58" width="16" height="14" fill="#000"/>',
powertool:'<circle cx="50" cy="66" r="15"'+S+'/><circle cx="50" cy="66" r="4" fill="#000"/><path d="M50 49L54 45M65 62L70 60M61 79L64 83M39 79L36 83M35 62L30 60M45 50L41 46"'+S+'/>',
electric:'<path d="M54 40L38 66H50L44 86L64 56H52L58 40Z" fill="#000"/>',
falling:'<rect x="40" y="42" width="20" height="14" fill="#000"/><path d="M50 60V74M44 69L50 75L56 69M30 84H70"'+S+'/>',
people:man(40,50)+'<path d="M40 56V70M40 70L35 82M40 70L45 82M33 62H47"'+S+'/>'+man(62,56,0.8)+'<path d="M62 61V72M62 72L58 82M62 72L66 82M56 66H68"'+S+'/>',
vehicle:'<path d="M28 76V64L36 54H56L66 64H72V76Z" fill="#000"/><circle cx="38" cy="78" r="5" fill="#000" stroke="#FFBE59" stroke-width="2"/><circle cx="62" cy="78" r="5" fill="#000" stroke="#FFBE59" stroke-width="2"/>',
weather:'<path d="M30 64Q28 52 40 52Q44 42 56 46Q70 44 68 58Q74 66 62 68H36Q28 68 30 64Z" fill="#000"/><path d="M38 74L35 82M50 74L47 82M62 74L59 82"'+S+'/>',
fragile:'<rect x="30" y="50" width="40" height="30"'+S+'/><path d="M48 50L44 60L54 66L48 80"'+S+'/>',
collapse:'<rect x="30" y="66" width="18" height="10" fill="#000"/><rect x="52" y="66" width="18" height="10" fill="#000"/><rect x="40" y="52" width="18" height="10" fill="#000" transform="rotate(-18 49 57)"/><path d="M62 42L68 50M30 84H70"'+S+'/>',
chemical:'<path d="M43 42H57M45 42V56L32 80H68L55 56V42"'+S+'/><path d="M37 72H63L68 80H32Z" fill="#000"/>',
gas:'<rect x="40" y="48" width="20" height="34" rx="9" fill="#000"/><rect x="45" y="40" width="10" height="9" fill="#000"/>',
sharp:'<path d="M28 74L66 46L72 52L34 80Z" fill="#000"/><path d="M28 74L34 80"'+S+'/>',
noise:'<path d="M44 82Q34 80 36 70Q34 64 38 58Q40 44 52 46Q62 48 60 60Q58 66 52 68Q50 74 46 74"'+S+'/><path d="M64 52Q70 60 64 68M70 46Q80 60 70 74"'+S+'/>',
heat:'<path d="M46 72V46A4 4 0 0 1 54 46V72"'+S+'/><circle cx="50" cy="76" r="7" fill="#000"/><path d="M60 50H66M60 58H66M60 66H66"'+S+'/>',
slip:man(56,46)+'<path d="M54 52L48 66M48 66L36 72M48 66L60 76M52 56L42 54M54 56L64 60M28 82H72"'+S+'/>',
fatigue:'<circle cx="50" cy="64" r="17"'+S+'/><path d="M50 54V64L57 69"'+S+'/>',
confined:'<ellipse cx="50" cy="77" rx="19" ry="6" fill="#000"/>'+man(50,47)+'<path d="M50 53V70M50 59L41 65M50 59L59 65"'+S+'/>',
bio:'<circle cx="50" cy="55" r="8"'+S+'/><circle cx="41" cy="71" r="8"'+S+'/><circle cx="59" cy="71" r="8"'+S+'/><circle cx="50" cy="66" r="3.5" fill="#000"/>',
laser:'<circle cx="40" cy="66" r="4" fill="#000"/><path d="M40 54V58M40 74V78M28 66H32M48 66H72M32 58L35 61M32 74L35 71M48 58L45 61M48 74L45 71"'+S+'/>',
general:'<path d="M50 46V68"'+S.replace('4"','6"')+'/><circle cx="50" cy="78" r="4" fill="#000"/>'
};
var R=[['asbestos',/asbestos/],['confined',/confined space|manhole|chamber|\bpit\b/],['bio',/biolog|sewage|sewer|\bdrains?\b|weil|leptospir|legionella|needle|bird dropping|contaminat|food and drink|food production|hygiene/],['laser',/laser/],['fire',/hot work|brazing|welding|torch|lithium|batter(y|ies)|charging|petrol|refuel|flammable/],['electric',/concealed services|live services|electrical isolation|power line/],['gasfume',/carbon monoxide|flue gas|fume|spillage/],['fragile',/fragile|skylight|rooflight|ceiling/],['sharp',/sharp|\bcut|laceration|glass|glazing|sheet material/],['slip',/slip|\btrip|obstruction|trailing/],['heat',/heat|temperature|\buv\b|sun exposure|cold store|freezer|\bcold\b/],['height',/height|fall from|scaffold|roof|mewp|elevating work platform|scissor lift|boom lift|opening|\bedges?\b|\bvoids?\b/],['ladder',/ladder/],['soot',/soot|creosote|\btar\b/],['dust',/dust|silica/],['fire',/fire|burn|commission/],['lifting',/manual handling|lifting|carrying/],['collapse',/unstable|collapse|masonry|structural|demolition|strip-out|temporary works|propping|shoring|excavation|trench/],['powertool',/power tool|\bsaw|grinder|drill|nail gun|cartridge|mixer|hand tool|vibration|wacker|compaction|grinding/],['electric',/electric|services|cable/],['falling',/falling object|dropped|overhead/],['people',/occupant|occupied|children|public|pets|people|visitor|unauthorised|client site/],['vehicle',/vehicle|driveway|traffic|machine|plant|driving|excavator|dumper/],['weather',/weather|\bwind|\brain/],['chemical',/substance|chemical|sealant|adhesive|cement|creosote|solvent|\blead\b|paint|resin|isocyanate/],['gas',/\bgas\b|pressure|compressed air/],['noise',/noise|hearing/],['slip',/slip|trip|housekeeping/],['fatigue',/fatigue|\blone\b|alone|stress|mental health/]];
function key(name){var s=String(name||'').toLowerCase();for(var i=0;i<R.length;i++)if(R[i][1].test(s))return R[i][0];return 'general';}
function icon(name,px){var k=typeof name==='string'&&P[name]?name:key(name);px=px||28;
 return '<svg class="hzi" data-hz="'+k+'" width="'+px+'" height="'+px+'" viewBox="0 0 100 100" style="vertical-align:middle;flex:none" aria-hidden="true"><path d="M50 5L97 90H3Z" fill="#FFBE59" stroke="#000" stroke-width="5" stroke-linejoin="round"/>'+P[k]+'</svg>';}
function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function keysIn(text){var parts=String(text||'').split(/\n|;|,(?![^()]*\))/),o=[];parts.forEach(function(p){if(!p.trim())return;var k=key(p);if(o.indexOf(k)<0)o.push(k);});if(o.length>1)o=o.filter(function(k){return k!=='general';});return o;}
function cell(text,px){var k=keysIn(text);return (k.length?'<div class="hzi-row">'+k.map(function(x){return icon(x,px||20);}).join('')+'</div>':'')+esc(text);}
function nameCell(name,px){return '<div class="hzi-name">'+icon(name,px||24)+'<b>'+esc(name)+'</b></div>';}
G.cbsHz={key:key,keysIn:keysIn,icon:icon,cell:cell,nameCell:nameCell,keys:Object.keys(P)};
})(typeof window!=='undefined'?window:this);

(function(G){
var W=' fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"',F=' fill="#fff"';
var P={
mask:'<path d="M28 44Q50 34 72 44L70 62Q50 76 30 62Z"'+F+'/><path d="M28 48L18 42M72 48L82 42M30 58L20 64M70 58L80 64"'+W+' stroke-width="3"/><circle cx="42" cy="56" r="3" fill="#005EB8"/><circle cx="50" cy="58" r="3" fill="#005EB8"/><circle cx="58" cy="56" r="3" fill="#005EB8"/>',
eye:'<path d="M20 48Q20 40 30 40H70Q80 40 80 48V56Q80 64 70 64H58L54 58H46L42 64H30Q20 64 20 56Z"'+F+'/><rect x="27" y="46" width="17" height="10" rx="4" fill="#005EB8"/><rect x="56" y="46" width="17" height="10" rx="4" fill="#005EB8"/>',
ear:'<path d="M28 58Q28 26 50 26Q72 26 72 58"'+W+'/><rect x="20" y="52" width="16" height="22" rx="7"'+F+'/><rect x="64" y="52" width="16" height="22" rx="7"'+F+'/>',
head:'<path d="M24 62Q24 34 50 32Q76 34 76 62Z"'+F+'/><rect x="18" y="62" width="64" height="8" rx="3"'+F+'/><rect x="47" y="30" width="6" height="18" rx="2" fill="#005EB8"/>',
gloves:'<path d="M36 80V52Q36 48 40 48V30Q40 26 44 26Q48 26 48 30V44V26Q48 22 52 22Q56 22 56 26V44V30Q56 26 60 26Q64 26 64 30V48Q68 46 70 50L62 70V80Z"'+F+'/>',
boots:'<path d="M32 24H50V56L74 62Q80 64 80 70V76H24V70L32 66Z"'+F+'/><rect x="24" y="72" width="56" height="4" fill="#005EB8"/>',
hivis:'<path d="M34 22L42 30H58L66 22L78 32V78H22V32Z"'+F+'/><path d="M50 30V78"'+' stroke="#005EB8" stroke-width="3"/><rect x="22" y="56" width="56" height="7" fill="#005EB8"/>',
harness:'<circle cx="50" cy="22" r="7"'+F+'/><path d="M50 30V60M50 38L36 52M50 38L64 52M50 60L40 80M50 60L60 80"'+W+'/><path d="M38 34L62 58M62 34L38 58"'+' fill="none" stroke="#FFBE59" stroke-width="4" stroke-linecap="round"/>',
coveralls:'<path d="M38 20H62L74 34L68 40L64 36V80H54L50 56L46 80H36V36L32 40L26 34Z"'+F+'/><path d="M50 22V50"'+' stroke="#005EB8" stroke-width="3"/>',
wash:'<path d="M26 66Q30 54 44 54H62Q66 54 66 58Q66 62 62 62H52L74 62Q78 62 78 66Q78 70 74 70H40Q30 72 26 66Z"'+F+'/><path d="M46 28V38M56 24V34M36 32V42"'+W+' stroke-width="4"/>',
manual:'<path d="M18 30Q34 24 50 32Q66 24 82 30V74Q66 68 50 76Q34 68 18 74Z"'+F+'/><path d="M50 32V76"'+' stroke="#005EB8" stroke-width="3"/><circle cx="34" cy="40" r="3" fill="#005EB8"/><path d="M34 48V62"'+' stroke="#005EB8" stroke-width="4" stroke-linecap="round"/>',
vacuum:'<rect x="24" y="46" width="30" height="28" rx="6"'+F+'/><circle cx="32" cy="76" r="4"'+F+'/><circle cx="48" cy="76" r="4"'+F+'/><path d="M54 54Q70 50 72 34L78 30"'+W+'/>'
,teamlift:'<circle cx="30" cy="30" r="7"'+F+'/><circle cx="70" cy="30" r="7"'+F+'/><path d="M30 38V58M30 58L24 78M30 58L36 78M70 38V58M70 58L64 78M70 58L76 78M30 44L40 50M70 44L60 50"'+W+'/><rect x="38" y="44" width="24" height="16"'+F+'/>'
,crawl:'<circle cx="50" cy="24" r="7"'+F+'/><path d="M50 32V52M50 52L42 66M50 52L58 66M50 38L38 46M50 38L62 46"'+W+'/><rect x="16" y="70" width="68" height="8"'+F+'/><path d="M24 70V78M40 70V78M60 70V78M76 70V78" stroke="#005EB8" stroke-width="2"/>'
,isolate:'<rect x="30" y="46" width="40" height="32" rx="4"'+F+'/><path d="M38 46V36Q38 24 50 24Q62 24 62 36V46"'+W+'/><circle cx="50" cy="60" r="4" fill="#005EB8"/><path d="M50 62V70" stroke="#005EB8" stroke-width="4" stroke-linecap="round"/>'
,vent:'<circle cx="50" cy="50" r="6"'+F+'/><path d="M50 44Q44 26 54 22Q64 24 56 44ZM56 50Q74 44 78 54Q76 64 56 56ZM50 56Q56 74 46 78Q36 76 44 56ZM44 50Q26 56 22 46Q24 36 44 44Z"'+F+'/>'
,test:'<path d="M22 62A28 28 0 0 1 78 62"'+W+'/><path d="M50 62L64 40"'+W+'/><circle cx="50" cy="62" r="5"'+F+'/><rect x="24" y="70" width="52" height="8" rx="3"'+F+'/>'
,sun:'<circle cx="50" cy="44" r="12"'+F+'/><path d="M50 22V26M50 62V66M28 44H32M68 44H72M34 28L37 31M63 57L66 60M66 28L63 31M37 57L34 60"'+W+' stroke-width="4"/><path d="M26 76Q50 64 74 76"'+W+'/>'
,water:'<path d="M50 20Q34 44 34 56A16 16 0 0 0 66 56Q66 44 50 20Z"'+F+'/>'
,breaks:'<circle cx="50" cy="50" r="26"'+W+'/><path d="M50 34V50L62 58"'+W+'/>'
,tidy:'<path d="M66 18L48 52"'+W+'/><path d="M40 48L58 58L52 80H24Z"'+F+'/>'
,light:'<path d="M50 18A18 18 0 0 0 38 50Q42 56 42 62H58Q58 56 62 50A18 18 0 0 0 50 18Z"'+F+'/><rect x="42" y="66" width="16" height="5" rx="2"'+F+'/><rect x="44" y="74" width="12" height="5" rx="2"'+F+'/>'
,spotter:'<circle cx="44" cy="24" r="7"'+F+'/><path d="M44 32V58M44 58L36 80M44 58L52 80M44 40L30 50M44 40L64 28"'+W+'/><rect x="62" y="20" width="12" height="10" rx="2"'+F+'/>'
,phone:'<rect x="36" y="18" width="28" height="64" rx="6"'+F+'/><rect x="40" y="26" width="20" height="40" fill="#005EB8"/><circle cx="50" cy="74" r="3" fill="#005EB8"/>'
,buddy:'<circle cx="36" cy="28" r="7"'+F+'/><circle cx="64" cy="28" r="7"'+F+'/><path d="M36 36V58M36 58L30 80M36 58L42 80M64 36V58M64 58L58 80M64 58L70 80M36 44L50 50L64 44"'+W+'/>'
};
var PR={
noentry:'<circle cx="50" cy="28" r="7" fill="#000"/><path d="M50 36V58M50 58L42 78M50 58L58 78M38 46H62" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round"/>',
noflame:'<path d="M50 78C38 78 33 70 36 61C38 55 43 52 42 44C49 48 52 54 51 59C54 56 55 52 54 48C63 54 66 63 64 70C62 76 57 78 50 78Z" fill="#000"/><path d="M42 82H58" stroke="#000" stroke-width="6" stroke-linecap="round"/>'
,nostep:'<rect x="24" y="62" width="52" height="16" fill="#000"/><path d="M36 28Q46 26 48 36L50 54Q50 58 46 58H34Q30 58 30 54Z" fill="#000"/>'
,nodrill:'<rect x="22" y="42" width="34" height="16" rx="3" fill="#000"/><rect x="56" y="47" width="22" height="5" fill="#000"/><path d="M30 58L26 76H38L40 58Z" fill="#000"/>'
};
var R=[['mask',/respirator|\brpe\b|\bp2\b|\bp3\b|mask|ffp/],['eye',/goggles|glasses|eye protection|face shield|visor/],['ear',/hearing|ear ?muff|earplug|ear protection/],['head',/hard hat|helmet|head protection/],['gloves',/glove/],['boots',/boots|footwear|toecap|safety shoes/],['hivis',/hi-?vis|high visibility/],['harness',/harness|lanyard|fall arrest|restraint/],['coveralls',/coverall|overalls|long sleeve/],['wash',/wash|hygiene|barrier cream/],['teamlift',/two-person|2-person|team lift|trolley|stair climber|safe lifting|mechanical lift|split loads/],['crawl',/purlin|nail line|crawl board|walk ?board|staging/],['isolate',/isolat|lock ?out|locked off|tag out|test before touch/],['vent',/ventilat/],['test',/spillage test|tightness test|draw and spillage|gas detect|co alarm|monitor/],['sun',/sun protection|sunscreen|sun ?hat/],['water',/water|drink|hydrat/],['breaks',/breaks?\b|limit time|rest\b/],['tidy',/tidy|housekeeping|clean up|clear the route/],['light',/lighting|torch/],['spotter',/spotter|banksman/],['phone',/check in|phone|radio/],['buddy',/alone|buddy|two people/],['manual',/permit|\bsds\b|safety data|manufacturer|instructions|induct|brief|engineer'?s advice|structural engineer|licensed|forecast/],['vacuum',/vacuum|extraction|\bh-class|\bm-class/],['extinguisher',/extinguisher/],['noentry',/exclusion|keep (?:others|occupants|people|pets|children)? ?out|stay out|segregat|no entry|cordon|unauthorised|barrier and sign/],['noflame',/no ignition|no smoking|no naked flame/],['nostep',/fragile|never step|don.t step|do not step/],['nodrill',/don.t cut|do not cut|don.t drill|do not drill|don.t sand|do not disturb/]];
function keys(text){var s=String(text||'').toLowerCase(),o=[];R.forEach(function(r){if(r[1].test(s))o.push(r[0]);});return o;}
function icon(k,px){px=px||22;if(k==='extinguisher')return '<svg class="cti" data-ct="extinguisher" width="'+px+'" height="'+px+'" viewBox="0 0 100 100" style="vertical-align:middle;flex:none" aria-hidden="true"><rect x="2" y="2" width="96" height="96" rx="10" fill="#D52B1E"/><rect x="38" y="34" width="24" height="50" rx="10" fill="#fff"/><path d="M46 34V24H58M58 24L68 30" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';if(PR[k])return '<svg class="cti" data-ct="'+k+'" width="'+px+'" height="'+px+'" viewBox="0 0 100 100" style="vertical-align:middle;flex:none" aria-hidden="true"><circle cx="50" cy="50" r="45" fill="#fff" stroke="#D52B1E" stroke-width="10"/>'+PR[k]+'<path d="M19 19L81 81" stroke="#D52B1E" stroke-width="10"/></svg>';
 return '<svg class="cti" data-ct="'+k+'" width="'+px+'" height="'+px+'" viewBox="0 0 100 100" style="vertical-align:middle;flex:none" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#005EB8"/>'+(P[k]||'')+'</svg>';}
function strip(text,px){return keys(text).map(function(k){return icon(k,px);}).join(' ');}
function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function cell(text,px){var k=keys(text);return (k.length?'<div class="hzi-row">'+k.map(function(x){return icon(x,px||18);}).join('')+'</div>':'')+esc(text);}
G.cbsCt={cell:cell,keys:keys,icon:icon,strip:strip,all:Object.keys(P).concat(['extinguisher']).concat(Object.keys(PR))};
})(typeof window!=='undefined'?window:this);

(function(){try{var st=document.createElement('style');st.textContent='.hzi-row{display:flex;flex-wrap:wrap;gap:3px;margin:0 0 3px;white-space:normal;line-height:0}.hzi-name svg{display:block;margin:0 0 3px}.hzi-name b{display:block;overflow-wrap:break-word;word-wrap:break-word;-webkit-hyphens:auto;hyphens:auto}';(document.head||document.documentElement).appendChild(st);}catch(e){}})();