// The office stamped into the block must be the office, wall for wall.
// Is the office inside the block still the office?   node tools/checkoffice.js
//
// maps/block.js stamps the campaign's own rows in as one of its places. That is good
// content for free, and also a thing that quietly breaks: a road routed across the
// map, a stray fillRect, and the building has a hole in it that nobody meant. This
// compares every cell of it against maps/office.js and allows exactly two deliberate
// differences -- its doors opened, and its dead-end street let out onto the block.
//
// It also walks the whole map from one spawn and reports any named place you cannot
// reach on foot.
// the block deliberately changes it: doors opened, and its dead-end street let out.
const fs=require('fs'), path=require('path'), vm=require('vm');
const JS=path.join(__dirname,'..','game','js');
const ctx=vm.createContext({console,Math,Object,Array,String,Number,JSON,Set,Map,
  Uint8Array,Int16Array,Float32Array,module:undefined});
for(const f of ['collide.js','maps/office.js','maps/block.js'])
  vm.runInContext(fs.readFileSync(path.join(JS,f),'utf8'),ctx,{filename:f});
const OFFICE_ROWS=vm.runInContext('OFFICE_ROWS',ctx);
const BLOCK_ROWS=vm.runInContext('BLOCK_ROWS',ctx);
const OFF_X=vm.runInContext('OFF_X',ctx),OFF_Y=vm.runInContext('OFF_Y',ctx),OFF_W=vm.runInContext('OFF_W',ctx);

const DOORS='DEFLUu';
let same=0,doors=0,street=0,bad=[];
for(let r=0;r<OFFICE_ROWS.length;r++){
  for(let c=0;c<OFF_W;c++){
    const want=OFFICE_ROWS[r][c];
    const got=BLOCK_ROWS[OFF_Y+r][OFF_X+c];
    if(want===got){same++;continue;}
    if(DOORS.includes(want)&&got==='.'){doors++;continue;}          // deliberate: doors opened
    // deliberate: the street's two ends and its far kerb let out onto the block
    const isStreetEnd=(r>=36&&r<=41)&&(c===0||c===OFF_W-1);
    const isKerb=r===42;
    if((isStreetEnd||isKerb)&&got==='.'){street++;continue;}
    bad.push(`office (${c},${r}) '${want}' became '${got}' at block (${OFF_X+c},${OFF_Y+r})`);
  }
}
console.log(`${same} cells identical, ${doors} doors opened, ${street} street cells let out`);
if(bad.length){
  console.log(`${bad.length} cells changed that should not have:`);
  for(const b of bad.slice(0,12))console.log('  '+b);
} else console.log('the office is intact: nothing else about it changed');

// and the places it reaches
const {buildCollision,blockedAt}=vm.runInContext('({buildCollision,blockedAt})',ctx);
const spec=vm.runInContext('BLOCK_MAP_SPEC',ctx);
const C=buildCollision(spec);
const zones=spec.zones.map(z=>z.name);
// flood from one spawn and report which named places you can get to
const seen=new Uint8Array(C.w*C.h);
const q=[Math.floor(C.spawns[0].y)*C.w+Math.floor(C.spawns[0].x)];
seen[q[0]]=1;
for(let i=0;i<q.length;i++){
  const x=q[i]%C.w,y=(q[i]/C.w)|0;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,ny=y+dy;
    if(nx<0||ny<0||nx>=C.w||ny>=C.h)continue;
    const ni=ny*C.w+nx;
    if(seen[ni]||blockedAt(C,nx,ny))continue;
    seen[ni]=1;q.push(ni);
  }
}
// which zones have at least one reachable cell
const reach=new Set();
for(const z of spec.zones){
  for(let y=z.y0;y<=z.y1&&!reach.has(z.name);y++)
    for(let x=z.x0;x<=z.x1;x++)
      if(seen[y*C.w+x]){reach.add(z.name);break;}
}
const missing=[...new Set(zones)].filter(n=>!reach.has(n));
console.log(`\n${reach.size} of ${new Set(zones).size} named places reachable on foot from spawn #0`);
if(missing.length)console.log('  cannot get to: '+missing.join(', '));
process.exit(bad.length||missing.length?1:0);
