/* Famosos: Web App independente, sem contas nem serviços pagos. */
const $=id=>document.getElementById(id);
const STORAGE='famosos_lista_v3';
const API='https://famosos-api.comercial-ddd.workers.dev';
// Os apelidos são persistidos separadamente da lista para manter o formato nome e foto.
const KNOWN_ALIASES={
  'the rock':'Dwayne Johnson',
  'dwayne the rock johnson':'Dwayne Johnson',
  'dwayne johnson':'Dwayne Johnson',
  'robert downey junior':'Robert Downey Jr.',
  'rdj':'Robert Downey Jr.',
  'j lo':'Jennifer Lopez',
  'jlo':'Jennifer Lopez',
  'king of pop':'Michael Jackson'
};
const ALIAS_KEY='famosos_apelidos_v1';
const PHOTO_OPTIONS_KEY='famosos_opcoes_fotos_v1';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function readObject(key){try{const x=JSON.parse(localStorage.getItem(key)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {};}}
const rememberedAliases=readObject(ALIAS_KEY);
const photoOptions=readObject(PHOTO_OPTIONS_KEY);
function canonical(name){
  let key=norm(name);
  for(let n=0;n<4;n++){
    const next=rememberedAliases[key]||KNOWN_ALIASES[key];
    if(!next||norm(next)===key)break;
    key=norm(next);
  }
  return key;
}
function samePerson(a,b){return !!norm(a)&&!!norm(b)&&canonical(a)===canonical(b);}
function findPerson(name){return people.find(p=>samePerson(p.name,name));}
function rememberIdentity(input,person,ai){
  if(!person)return;
  const target=person.name;
  for(const word of [input,ai?.nome,ai?.nome_canonico]){
    if(word&&norm(word)!==norm(target))rememberedAliases[norm(word)]=target;
  }
  try{localStorage.setItem(ALIAS_KEY,JSON.stringify(rememberedAliases));}catch{}
}
function cacheOptions(name,found){
  if(!found?.length)return;
  photoOptions[canonical(name)]=[...new Set(found)].slice(0,30);
  try{localStorage.setItem(PHOTO_OPTIONS_KEY,JSON.stringify(photoOptions));}catch{}
}
async function askGemini(name){const r=await fetch(API+'?nome='+encodeURIComponent(name));if(!r.ok)throw Error('A IA não respondeu');const d=await r.json();if(d.erro)throw Error(d.erro);return d;}
let people=loadPeople(), selection=null, candidates=[], photoIndex=0, currentUpload=null;
let abortExport=false, exportBusy=false;
const urls=new Map(), loading=new Set();
function loadPeople(){try{const a=JSON.parse(localStorage.getItem(STORAGE)||localStorage.getItem('famosos_lista_v2'));if(Array.isArray(a))return a.filter(p=>p&&typeof p.name==='string').map(p=>({name:p.name,url:p.url||'',source:p.source||'',locked:!!p.locked}));}catch{}return SEED_NAMES.map(name=>({name,url:'',source:'',locked:false}));}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(people));}catch(e){announce('Espaço insuficiente para salvar alterações neste navegador.');}}
function announce(s){$('status').textContent=s;}
function safeName(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9 _-]/g,'').trim().replace(/\s+/g,'_').slice(0,80)||'foto';}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open('famosos_fotos',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function dbGet(key){try{const db=await openDB();return await new Promise((res,rej)=>{const r=db.transaction('photos','readonly').objectStore('photos').get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}catch{return null;}}
async function dbPut(key,blob){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(blob,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function dbDel(key){try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}catch{}}
async function getPhotoBlob(p){const existing=await dbGet(p.name);if(existing)return existing;if(!p.url||p.url.startsWith('local:'))return null;try{const r=await fetch(p.url,{mode:'cors'});if(!r.ok)throw Error('foto indisponível');const blob=await r.blob();if(!blob.type.startsWith('image/'))return null;await dbPut(p.name,blob);return blob;}catch{return null;}}
async function getViewUrl(p){const blob=await dbGet(p.name);if(blob){if(!urls.has(p.name))urls.set(p.name,URL.createObjectURL(blob));return urls.get(p.name);}return p.url&&!p.url.startsWith('local:')?p.url:'';}
function clearObjUrl(name){if(urls.has(name)){URL.revokeObjectURL(urls.get(name));urls.delete(name);}}
function render(){updateSearchButton();const term=norm($('search').value), canonicalTerm=canonical(term), shown=people.filter(p=>norm(p.name).includes(term)||(term&&canonical(p.name)===canonicalTerm));$('count').textContent=`${people.length} nomes, ${shown.length} exibidos`;$('grid').replaceChildren();if(!shown.length){const d=document.createElement('div');d.className='empty';d.textContent='Nome não encontrado. Use Adicionar para identificar e incluir.';$('grid').append(d);return;}
const frag=document.createDocumentFragment();for(const p of shown){const card=document.createElement('article');card.className='person';const portrait=document.createElement('div');portrait.className='portrait';portrait.textContent='◯';portrait.dataset.person=p.name;const body=document.createElement('div');body.className='personbody';const name=document.createElement('div');name.className='name';name.textContent=p.name;const acts=document.createElement('div');acts.className='actions';const btn=document.createElement('button');btn.className='btn small';btn.textContent='Trocar foto';btn.onclick=()=>editPhoto(p);acts.append(btn);body.append(name,acts);const del=document.createElement('button');del.className='del';del.textContent='×';del.title='Excluir da lista';del.setAttribute('aria-label',`Excluir ${p.name}`);del.onclick=async()=>{if(!confirm(`Excluir ${p.name} da lista?`))return;people=people.filter(x=>x!==p);clearObjUrl(p.name);await dbDel(p.name);persist();render();};card.append(portrait,body,del);frag.append(card);} $('grid').append(frag);observePortraits();}
let observer;
function observePortraits(){if(observer)observer.disconnect();observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){observer.unobserve(e.target);fillPortrait(e.target);}}},{rootMargin:'500px'});document.querySelectorAll('.portrait').forEach(el=>observer.observe(el));}
async function fillPortrait(el){const name=el.dataset.person,p=people.find(x=>x.name===name);if(!p||!el.isConnected)return;let src=await getViewUrl(p);if(!src&&!p.locked&&!loading.has(name)){loading.add(name);try{const found=await wikiPortrait(name);if(found){p.url=found;p.source='Wikipédia';persist();src=found;}}catch{}finally{loading.delete(name);}}if(!el.isConnected||!src)return;const img=document.createElement('img');img.loading='lazy';img.alt=name;img.src=src;img.onerror=()=>{img.remove();el.textContent='◯';};el.replaceChildren(img);}
async function wikiPortrait(name){for(const domain of ['pt.wikipedia.org','en.wikipedia.org']){try{const u=`https://${domain}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=5&prop=pageimages&pithumbsize=640&format=json&origin=*`;const r=await fetch(u);if(!r.ok)continue;const data=await r.json();const pages=Object.values(data.query?.pages||{}).sort((a,b)=>(a.index||99)-(b.index||99));const exact=pages.find(p=>norm(p.title)===norm(name)&&p.thumbnail);const choice=exact||pages.find(p=>p.thumbnail&&norm(p.title).includes(norm(name)));if(choice)return choice.thumbnail.source;}catch{}}return '';
}
async function findCandidates(name, skipAI=true){
 const out=[],seen=new Set();
 const add=u=>{if(u&&typeof u==='string'&&u.startsWith('https:')&&!seen.has(u)){seen.add(u);out.push(u);}};
 try{const selected=people.find(p=>p.name===name);if(selected?.url&&!selected.url.startsWith('local:'))add(selected.url);}catch{}
 const ranked=await commonsHeadshots(name);
 const wiki=await wikiPortrait(name);
 if(wiki)add(wiki);
 for(const pic of ranked)add(pic.url);
 // Do not reuse older unfiltered photos when curated results are available.
 if(!out.length)for(const u of photoOptions[canonical(name)]||[])add(u);
 cacheOptions(name,out);return out;
}
// Revisa fotos buscando retratos reais e preserva a lista existente.
// Sem reconhecimento facial, as sugestões não são verificações de identidade.
const BLOCKED_IMAGE=/madonna and child|virgin mary|madonna with child|mother of god|virgin and child|painting|portrait of a lady|oil on canvas|altarpiece|religious|icon of|sculpture|statue|mural|drawing|illustration|caricature|comic|logo|poster|album cover|cover art|collage|group photo|group portrait|wax figure|cosplay|artwork|depiction|fan art|film poster|movie poster|ai.generated|generated image/i;
const QUALIFIERS={
 'madonna':'Madonna singer musician American',
 'will smith':'Will Smith actor American',
 'the rock':'Dwayne Johnson actor',
 'dwayne johnson':'Dwayne Johnson actor',
 'roberto carlos':'Roberto Carlos singer Brazil',
 'leonardo':'Leonardo sertanejo singer Brazil',
 'daniel':'Daniel singer Brazil',
 'jorge':'Jorge singer sertanejo Brazil',
 'mateus':'Mateus singer sertanejo Brazil',
 'luciano':'Luciano singer sertanejo Brazil',
 'cristiano':'Cristiano sertanejo singer Brazil',
 'henrique':'Henrique sertanejo singer Brazil',
 'juliano':'Juliano sertanejo singer Brazil',
 'ze neto':'Zé Neto sertanejo Brazil',
 'anitta':'Anitta singer Brazil',
 'iza':'IZA singer Brazil',
 'al oc':'Alok DJ Brazil',
 'al ok':'Alok DJ Brazil',
 'al ok dj':'Alok DJ Brazil',
 's i a':'Sia singer Australia',
 'sia':'Sia singer Australia',
 'sting':'Sting musician singer',
 'bono':'Bono U2 singer',
 'prince':'Prince singer musician',
 'usher':'Usher singer',
 'adele':'Adele singer British',
 'zendaya':'Zendaya actress',
 'selena gomez':'Selena Gomez singer actress',
 'michael jackson':'Michael Jackson singer',
 'maria bethania':'Maria Bethânia singer Brazil',
 'fernanda torres':'Fernanda Torres actress Brazil',
 'fernanda montenegro':'Fernanda Montenegro actress Brazil'
};
function searchIdentity(name){return QUALIFIERS[norm(name)]||name;}
const normalizeWords=t=>new Set(norm(t).split(' ').filter(x=>x.length>2));
function scoreCandidate(title,person){
 const text=String(title||'').replace(/^File:/i,'');
 if(BLOCKED_IMAGE.test(text))return -1000;
 const n=norm(text), personWords=[...normalizeWords(person)];
 if(!personWords.some(w=>n.includes(w)))return -1000;
 const matched=personWords.filter(w=>n.includes(w)).length;
 const isCommon=personWords.length===1;
 let score=matched*8;
 if(isCommon && !/singer|actress|actor|musician|portrait|headshot|photo|performer|vocalist|dj|celebrity/i.test(text)) score-=20;
 if(/headshot|close.up|face|portrait|bust|profile photo/i.test(text)) score+=25;
 if(/actor|actress|singer|musician|vocalist|performer/i.test(text))score+=8;
 if(/cropped|crop|studio|press|official/i.test(text))score+=4;
 if(/concert|stage|red.carpet|award/i.test(text))score-=3;
 if(/band|duo|together|cast|with |and /i.test(text))score-=20;
 return score;
}
async function commonsHeadshots(name){
 const qualified=searchIdentity(name), queries=[qualified+' portrait',qualified+' headshot',qualified+' close up'];
 let found=[];const used=new Set();
 for(const q of queries){
   const endpoint=new URL('https://commons.wikimedia.org/w/api.php');
   endpoint.search=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:'filetype:bitmap '+q,gsrnamespace:'6',gsrlimit:'30',prop:'imageinfo',iiprop:'url|mime|size',iiurlwidth:'850',origin:'*'}).toString();
   try{
     const r=await fetch(endpoint.toString(),{signal:AbortSignal.timeout(18000)});
     if(!r.ok)continue;const d=await r.json();
     for(const page of Object.values(d.query?.pages||{})){
       const meta=page.imageinfo?.[0]; if(!meta||!meta.mime?.startsWith('image/')||meta.mime.includes('svg'))continue;
       const u=meta.thumburl||meta.url;
       if(!u||used.has(u))continue;used.add(u);
       if(meta.width && meta.height && (meta.width<320||meta.height<320))continue;
       const score=scoreCandidate(page.title,name);
       if(score<=0)continue;
       found.push({url:u,score,title:page.title});
     }
   }catch{}
   if(found.some(x=>x.score>=33))break;
 }
 found.sort((a,b)=>b.score-a.score);
 return found;
}
async function bestPortrait(name){
 // For one-word names, prefer verified Wikipedia profile when Commons is ambiguous.
 const listed=await commonsHeadshots(name);
 if(listed.length && listed[0].score>=30)return listed[0].url;
 const wiki=await wikiPortrait(name);
 if(wiki)return wiki;
 return listed.length && listed[0].score>=15?listed[0].url:'';
}
let batchRunning=false, batchCancelled=false;
function sleep(ms){return new Promise(ok=>setTimeout(ok,ms));}
async function refreshEntireList(){
 if(batchRunning||exportBusy)return;
 const overwrite=confirm('Vamos procurar retratos para todos os nomes. Fotos escolhidas manualmente serão preservadas. Deseja também substituir suas fotos escolhidas manualmente?\n\nOK: substituir todas as fotos.\nCancelar: preservar fotos manuais e continuar.');
 if(!confirm('Antes de começar, recomendamos usar Cópia da lista para guardar seus nomes. Iniciar a revisão de '+people.length+' famosos agora?'))return;
 batchRunning=true;batchCancelled=false;
 $('refreshAll').disabled=true;
 const group=[...people];let updated=0,skipped=0,failed=0;
 $('progCancel').textContent='Cancelar revisão';
 for(let i=0;i<group.length;i++){
   if(batchCancelled)break;
   const p=group[i];
   progress('Revisando fotos da lista',100*i/group.length,`${i+1} de ${group.length}, ${p.name}. Atualizadas: ${updated}`);
   if(p.locked&&!overwrite){skipped++;continue;}
   try{
     const url=await bestPortrait(p.name);
     if(!url){failed++;continue;}
     // Store each image before overwriting a previous saved choice.
     let blob=null;
     try{const r=await fetch(url,{mode:'cors',signal:AbortSignal.timeout(16000)});if(r.ok){const b=await r.blob();if(b.type.startsWith('image/')&&b.size>3000)blob=b;}}catch{}
     if(!blob){failed++;continue;}
     const current=people.find(x=>x.name===p.name);
     if(!current){skipped++;continue;}
     await dbPut(p.name,blob);
     current.url=url;current.source='Retrato pesquisado';current.locked=false;
     clearObjUrl(p.name);updated++;persist();
   }catch(e){failed++;}
   if(i%5===0)await sleep(100);
 }
 batchRunning=false;$('refreshAll').disabled=false;
 endProgress();
 $('progCancel').textContent='Cancelar';
 render();announce(`${batchCancelled?'Revisão interrompida.':'Revisão concluída.'} ${updated} fotos atualizadas, ${skipped} preservadas, ${failed} não encontradas. Fotos sem resultado foram mantidas.`);
}
$('refreshAll').onclick=refreshEntireList;
function dlgInfo(text){$('dlgStatus').textContent=text;}
function displaySelection(){const img=candidates[photoIndex];$('dlgPreview').replaceChildren();if(img){const el=document.createElement('img');el.src=img;el.alt=selection?.name||'Foto';el.onerror=()=>dlgInfo('Esta imagem não abriu. Toque em Outra foto.');$('dlgPreview').append(el);dlgInfo(`Foto ${photoIndex+1} de ${candidates.length}. Você pode escolher outra.`);}else{$('dlgPreview').textContent='Sem foto';dlgInfo('Não encontramos fotos automaticamente. Você pode escolher uma imagem do aparelho.');}$('prevPhoto').disabled=photoIndex<=0;$('nextPhoto').disabled=photoIndex>=candidates.length-1;$('dlgSave').disabled=!img&&!currentUpload;}
async function editPhoto(p,prefetched=[]){selection=p;currentUpload=null;candidates=[];photoIndex=0;$('dlgName').textContent=p.name;$('dialogBg').classList.add('open');$('dlgPreview').textContent='Pesquisando...';dlgInfo('Buscando fotos na Wikipédia e no Wikimedia Commons...');$('dlgSave').disabled=true;$('photoUpload').value='';try{const found=prefetched.length?prefetched:await findCandidates(p.name);if(selection!==p)return;candidates=found;cacheOptions(p.name,candidates);if(p.url&&!p.url.startsWith('local:')){const i=candidates.indexOf(p.url);if(i>=0)photoIndex=i;else{candidates.unshift(p.url);photoIndex=0;}}displaySelection();}catch{displaySelection();}}
function closeDialog(){$('dialogBg').classList.remove('open');selection=null;currentUpload=null;}
$('prevPhoto').onclick=()=>{if(photoIndex>0){photoIndex--;currentUpload=null;displaySelection();}};
$('nextPhoto').onclick=()=>{if(photoIndex<candidates.length-1){photoIndex++;currentUpload=null;displaySelection();}};
$('dlgCancel').onclick=closeDialog;
$('photoUpload').onchange=async e=>{const f=e.target.files?.[0];if(!f||!f.type.startsWith('image/'))return;currentUpload=f;const tmp=URL.createObjectURL(f);$('dlgPreview').replaceChildren();const i=document.createElement('img');i.src=tmp;i.onload=()=>URL.revokeObjectURL(tmp);$('dlgPreview').append(i);dlgInfo('Imagem selecionada no aparelho. Toque em Salvar foto.');$('dlgSave').disabled=false;};
$('dlgSave').onclick=async()=>{if(!selection)return;const p=selection,blob=currentUpload,url=currentUpload?'local:foto':candidates[photoIndex];if(!blob&&!url)return;$('dlgSave').disabled=true;try{if(blob){await dbPut(p.name,blob);}else{const response=await fetch(url,{mode:'cors'});if(response.ok){const b=await response.blob();if(b.type.startsWith('image/'))await dbPut(p.name,b);}}p.url=url;p.locked=true;p.source=blob?'Arquivo do aparelho':'Wikimedia';clearObjUrl(p.name);persist();closeDialog();render();announce(`Foto de ${p.name} salva.`);}catch(e){dlgInfo('Não foi possível guardar essa foto. Tente outra ou escolha do aparelho.');$('dlgSave').disabled=false;}};
$('search').addEventListener('input',render);
$('resetFilter').onclick=()=>{$('search').value='';render();};
function updateSearchButton(){
  const term=$('search').value.trim();
  const exists=findPerson(term);
  $('add').textContent=exists||!term?'⌕':'＋ Adicionar';
  $('add').title=exists?'Ver e trocar foto':'Pesquisar e adicionar famoso';
}
$('add').onclick=async()=>{
  const name=$('search').value.trim().replace(/\s+/g,' ');
  if(!name){$('search').focus();return;}
  let p=findPerson(name);
  if(p){
    $('search').value=p.name;
    render();
    await editPhoto(p);
    return;
  }
  $('add').disabled=true;
  let ai=null;
  try{
    announce('Identificando o famoso com o Gemini...');
    ai=await askGemini(name);
  }catch(e){announce('IA indisponível. Você ainda pode incluir o nome e escolher uma foto.');}
  finally{$('add').disabled=false;}
  p=findPerson(ai?.nome_canonico)||findPerson(ai?.nome)||findPerson(name);
  if(p){
    rememberIdentity(name,p,ai);
    if(ai?.fotos?.length)cacheOptions(p.name,ai.fotos);
    $('search').value=p.name;
    render();
    announce(`${p.name} já está na lista. Nenhum nome foi duplicado.`);
    await editPhoto(p,ai?.fotos||[]);
    return;
  }
  const displayName=ai?.nome||name;
  p={name:displayName,url:'',source:'',locked:false};
  people.push(p);
  rememberIdentity(name,p,ai);
  if(ai?.fotos?.length)cacheOptions(p.name,ai.fotos);
  persist();
  $('search').value=p.name;
  render();
  announce(`${p.name} incluído na lista. Escolha e salve uma foto.`);
  await editPhoto(p,ai?.fotos||[]);
};
$('search').addEventListener('keydown',e=>{if(e.key==='Enter')$('add').click();});
$('dialogBg').onclick=e=>{if(e.target===$('dialogBg'))closeDialog();};
$('progCancel').onclick=()=>{abortExport=true;batchCancelled=true;};
function progress(label,percent,detail){$('progress').classList.add('open');$('progLabel').textContent=label;$('progBar').value=percent;$('progDetails').textContent=detail;}
function endProgress(){$('progress').classList.remove('open');exportBusy=false;abortExport=false;}
function saveFile(blob,file){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
function mimeExt(blob){const m=(blob.type||'').toLowerCase();return m.includes('png')?'png':m.includes('webp')?'webp':m.includes('gif')?'gif':m.includes('heic')?'heic':'jpg';}
async function buildZip(onlyPhotos=false){if(exportBusy)return;exportBusy=true;abortExport=false;const zip=new JSZip();const folder=zip.folder('fotos');const manifest=[];let complete=0,missing=[];progress('Preparando exportação',0,`0 de ${people.length}`);
try{for(let i=0;i<people.length;i++){if(abortExport){announce('Exportação cancelada.');return;}const p=people[i];let blob=await getPhotoBlob(p);if(!blob&&!p.locked){try{const found=await wikiPortrait(p.name);if(found){p.url=found;p.source='Wikipédia';persist();blob=await getPhotoBlob(p);}}catch{}}
let file='';if(blob){file=`${String(i+1).padStart(3,'0')}_${safeName(p.name)}.${mimeExt(blob)}`;folder.file(file,blob);complete++;}else missing.push(p.name);manifest.push({nome:p.name,foto:file?`fotos/${file}`:''});progress(onlyPhotos?'Salvando todas as fotos':'Exportando lista e fotos',(i+1)*85/people.length,`${i+1} de ${people.length} verificados, ${complete} fotos`);await new Promise(r=>setTimeout(r,0));}
if(!onlyPhotos){zip.file('lista.json',JSON.stringify(manifest,null,2));zip.file('lista.csv','Nome;Arquivo da foto\n'+manifest.map(p=>`"${p.nome.replace(/"/g,'""')}";"${p.foto}"`).join('\n'));const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lista de famosos</title><style>body{font-family:Arial,sans-serif;background:#151b24;color:white;padding:20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:15px}.item{background:#263342;padding:9px;border-radius:12px;text-align:center}img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}p{font-weight:bold}</style><h1>Lista de famosos</h1><div class="grid">${manifest.map(p=>`<div class="item">${p.foto?`<img src="${p.foto}" alt="">`:'<div style="height:120px">Sem foto</div>'}<p>${p.nome.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</p></div>`).join('')}</div></html>`;zip.file('abrir_lista.html',html);}if(missing.length)zip.file('fotos_nao_encontradas.txt',missing.join('\n'));progress('Compactando arquivos',90,`${complete} fotos, ${missing.length} sem imagem`);const result=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}},m=>progress('Compactando arquivos',90+m.percent*.1,`${complete} fotos incluídas`));saveFile(result,onlyPhotos?'famosos_todas_as_fotos.zip':'famosos_lista_com_fotos.zip');announce(`Arquivo preparado com ${complete} fotos. ${missing.length} nomes sem imagem. Confira o arquivo baixado.`);}catch(e){announce('Erro na exportação: '+e.message);}finally{endProgress();}}
$('exportFull').onclick=()=>buildZip(false);
$('exportPics').onclick=()=>buildZip(true);
$('exportBackup').onclick=()=>saveFile(new Blob([JSON.stringify(people,null,2)],{type:'application/json'}),'famosos_copia_lista.json');
$('importBackup').onclick=()=>$('importInput').click();
$('importInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const entries=JSON.parse(await f.text());if(!Array.isArray(entries)||!entries.every(p=>p&&typeof p.name==='string'))throw Error('Formato inválido');if(!confirm('Substituir sua lista atual pelos nomes deste arquivo? As fotos salvas no aparelho não serão apagadas.'))return;people=entries.map(p=>({name:p.name,url:p.url||'',source:p.source||'',locked:!!p.locked}));persist();$('search').value='';render();announce('Lista importada com sucesso.');}catch(e){announce('Não foi possível importar este arquivo.');}finally{e.target.value='';}};
render();if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
