// Detector gratuito de rostos, executado localmente no dispositivo.
// Modelo MediaPipe oficial, carregado ao usar pela primeira vez.
let singleton;
export async function getFaceTools(){
 if(singleton)return singleton;
 singleton=(async()=>{
  const sdk=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm');
  const vision=await sdk.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm');
  const detector=await sdk.FaceDetector.createFromOptions(vision,{
   baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',delegate:'CPU'},
   runningMode:'IMAGE',minDetectionConfidence:0.55
  });
  return {processUrl:async url=>{
   const response=await fetch(url,{mode:'cors',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Falha ao carregar foto');
   const original=await response.blob();
   if(!original.type.startsWith('image/'))return null;
   const bitmap=await createImageBitmap(original);
   try{
    const w=bitmap.width,h=bitmap.height;
    if(w<220||h<220)return null;
    // Análise em resolução reduzida para economizar bateria.
    const s=Math.min(1,720/Math.max(w,h));
    const cv=document.createElement('canvas');cv.width=Math.round(w*s);cv.height=Math.round(h*s);
    cv.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,cv.width,cv.height);
    const faces=detector.detect(cv).detections||[];
    if(faces.length!==1)return null;
    const f=faces[0];const b=f.boundingBox;
    if(!b||b.width<=0||b.height<=0)return null;
    const area=(b.width*b.height)/(cv.width*cv.height);
    const centerX=(b.originX+b.width/2)/cv.width,centerY=(b.originY+b.height/2)/cv.height;
    const centered=1-Math.min(1,Math.hypot(centerX-.5,centerY-.43)*1.4);
    const key=f.keypoints||[];
    // Os dois primeiros pontos representam olhos no modelo BlazeFace.
    let frontal=.5;
    if(key.length>=3){
     const e1=key[0],e2=key[1],nose=key[2];
     const dist=Math.abs(e1.x-e2.x);
     if(dist>.001){
      const eyeMid=(e1.x+e2.x)/2;
      const skew=Math.abs(nose.x-eyeMid)/dist;
      frontal=Math.max(0,1-Math.min(1,skew*2.5));
     }
    }
    const faceSize=Math.min(1,Math.sqrt(area)/.55);
    const resolution=Math.min(1,Math.min(w,h)/950);
    const score=faceSize*45+frontal*32+centered*13+resolution*10;
    // Recorte quadrado inclui rosto, cabelo e parte dos ombros.
    const scale=1/s;
    const cx=(b.originX+b.width/2)*scale;
    const cy=(b.originY+b.height*.47)*scale;
    const square=Math.min(Math.max(b.width*scale*2.35,b.height*scale*1.95),w,h);
    const side=Math.max(1,Math.floor(square));
    const cropX=Math.max(0,Math.min(w-side,cx-side/2));
    const cropY=Math.max(0,Math.min(h-side,cy-side*.45));
    const out=document.createElement('canvas');out.width=640;out.height=640;
    out.getContext('2d').drawImage(bitmap,cropX,cropY,side,side,0,0,640,640);
    const blob=await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',.88));
    if(!blob)return null;
    return {blob,score};
   }finally{bitmap.close?.();}
  }};
 })().catch(err=>{singleton=null;throw err;});
 return singleton;
}
