process.env.DATABASE_URL='memory';
const fs=require('fs'),path=require('path'),vm=require('vm');const {JSDOM}=require('jsdom');
const FE=path.join(__dirname,'../../frontend');
const html=fs.readFileSync(FE+'/index.html','utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const dom=new JSDOM(html,{url:'https://olc.test/',runScripts:'dangerously',pretendToBeVisual:true});const w=dom.window;
const old={profile:{name:'SK'},xp:300,goals:[{id:'g1',label:'Study',xp:10}],dailyLogs:{'2026-09-30':{items:{g1:'full'},waterL:1}},trackerLogs:{weight:[{date:'2026-09-30',v:50}]},streaks:{study:{count:2,lastDate:'2026-09-30'}}};
w.localStorage.setItem('olc2_accounts',JSON.stringify([{id:'u_1',username:'Abcdefg1@olc.com',token:'x'}]));
w.localStorage.setItem('olc2_state_u_1',JSON.stringify(old));
w.fetch=()=>Promise.reject(new Error('offline'));w.matchMedia=()=>({matches:false});w.confirm=()=>true;w.alert=()=>{};
w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};w.crypto=require('crypto').webcrypto;w.TextEncoder=TextEncoder;w.AbortController=AbortController;
const ctx=dom.getInternalVMContext();const errs=[];w.addEventListener('error',e=>errs.push(e.message));
new vm.Script(fs.readFileSync(FE+'/app.js','utf8')).runInContext(ctx);new vm.Script(fs.readFileSync(FE+'/auth.js','utf8')).runInContext(ctx);
const ev=s=>vm.runInContext(s,ctx);
setTimeout(()=>{
  if(!w.document.body.classList.contains('app-on')){console.log('APP NOT OPEN');process.exit(1);}
  for(const s of ['home','dashboard','profile','mission','streaks','daily','trackers','rank','medals','achievements','badges','rulebook','archives']){
    ev(`go('${s}')`);const html=w.document.getElementById('mainContent').innerHTML;
    const bad=html.includes('hit a data problem');console.log(bad?'  ✗':'  ✓',s,html.length);if(bad){console.log(html.slice(0,600));errs.push(s);}
  }
  console.log(errs.length?'ERRORS: '+errs.join(' | '):'ALL SECTIONS RENDER');process.exit(errs.length?1:0);
},1500);
