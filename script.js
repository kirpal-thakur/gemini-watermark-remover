import {
  removeWatermarkFromImageData,
  createWatermarkEngine
} from "https://cdn.jsdelivr.net/npm/@pilio/gemini-watermark-remover@1.0.43/+esm";

const $=s=>document.querySelector(s);
const imageMode=$("#imageMode"),videoMode=$("#videoMode");
const imageTool=$("#imageTool"),videoTool=$("#videoTool");
const imageInput=$("#imageInput"),imageDrop=$("#imageDrop"),imageChoose=$("#imageChoose");
const videoInput=$("#videoInput"),videoDrop=$("#videoDrop"),videoChoose=$("#videoChoose");
let enginePromise=null, images=[], selected=0, sliderDragging=false;

// GA4 helper: sends interaction metadata only, never file contents or filenames.
function trackEvent(name, params={}){
  if(typeof window.gtag === "function") window.gtag("event", name, params);
}

imageMode.onclick=()=>switchMode("image");
videoMode.onclick=()=>switchMode("video");
function switchMode(mode){
  imageMode.classList.toggle("active",mode==="image");
  videoMode.classList.toggle("active",mode==="video");
  imageTool.classList.toggle("active-tool",mode==="image");
  videoTool.classList.toggle("active-tool",mode==="video");
  trackEvent("mode_switch", {mode});
}

imageChoose.onclick=()=>imageInput.click();
$("#addImages").onclick=()=>imageInput.click();
imageInput.onchange=()=>{addImages([...imageInput.files]);imageInput.value=""};

function addImages(files){
  files=files.filter(f=>["image/png","image/jpeg","image/webp"].includes(f.type));
  if(!files.length)return;
  trackEvent("image_upload", {count: files.length});
  files.forEach(file=>images.push({file,original:URL.createObjectURL(file),clean:null,blob:null,applied:false}));
  if(!images.length)return;
  $("#imageDrop").classList.add("hidden");
  $("#imageEditor").classList.remove("hidden");
  selected=Math.max(0,images.length-files.length);
  renderThumbs();selectImage(selected);
  files.forEach((_,i)=>processImage(selected+i));
}
function renderThumbs(){
  const wrap=$("#thumbs");wrap.innerHTML="";
  images.forEach((x,i)=>{
    const im=document.createElement("img");im.src=x.original;im.className="thumb"+(i===selected?" selected":"");
    im.onclick=()=>selectImage(i);wrap.appendChild(im);
  });
  const add=document.createElement("button");add.className="add-thumb";add.textContent="+";add.onclick=()=>imageInput.click();wrap.appendChild(add);
}
function selectImage(i){
  if(!images[i])return;
  selected=i;
  const item=images[i];
  beforeImg.src=item.original;
  afterImg.src=item.clean||item.original;
  showImageResult(item.clean?"after":"before");
  document.querySelectorAll(".thumb").forEach((x,n)=>x.classList.toggle("selected",n===i));
  $("#imagePreviewState").classList.toggle("hidden",Boolean(item.clean));
  $("#imageStatus").textContent=item.clean
    ? (item.applied?"Watermark removed locally":"No supported watermark detected")
    : "Processing locally…";
}
async function processImage(i){
  try{
    trackEvent("image_processing_started");
    const x=images[i],bitmap=await createImageBitmap(x.file),canvas=document.createElement("canvas");
    canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext("2d").drawImage(bitmap,0,0);bitmap.close();
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const result=await removeWatermarkFromImageData(ctx.getImageData(0,0,canvas.width,canvas.height),{engine:await getEngine(),adaptiveMode:"auto"});
    const out=document.createElement("canvas");out.width=result.imageData.width;out.height=result.imageData.height;
    out.getContext("2d").putImageData(result.imageData,0,0);
    x.blob=await blob(out);x.clean=URL.createObjectURL(x.blob);x.applied=Boolean(result.meta?.applied);
    trackEvent("image_processing_completed", {watermark_detected: x.applied ? "yes" : "no"});
    if(i===selected){
      selectImage(i);
      requestAnimationFrame(()=>$("#imageEditor").scrollIntoView({behavior:"smooth",block:"center"}));
    }
  }catch(e){
    console.error(e);
    trackEvent("image_processing_error");
    if(i===selected)$("#imageStatus").textContent="Processing failed";
  }
}
function getEngine(){if(!enginePromise)enginePromise=createWatermarkEngine();return enginePromise}
function blob(c){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("encode failed")),"image/png"))}

const beforeTab=$("#beforeTab"),afterTab=$("#afterTab"),beforeImg=$("#before"),afterImg=$("#after");
function showImageResult(which){
  const isAfter=which==="after";
  beforeImg.classList.toggle("hidden-result",isAfter);
  afterImg.classList.toggle("hidden-result",!isAfter);
  beforeTab.classList.toggle("active",!isAfter);
  afterTab.classList.toggle("active",isAfter);
  beforeTab.setAttribute("aria-selected",String(!isAfter));
  afterTab.setAttribute("aria-selected",String(isAfter));
}
beforeTab.onclick=()=>showImageResult("before");
afterTab.onclick=()=>showImageResult("after");

$("#downloadImage").onclick=()=>{
  const x=images[selected];
  if(x?.blob){
    trackEvent("image_download", {format:"png"});
    download(x.blob,"gemini-clean-"+base(x.file.name)+".png");
  }
};
$("#copyImage").onclick=async()=>{
  const x=images[selected];if(!x?.blob)return;
  try{
    await navigator.clipboard.write([new ClipboardItem({"image/png":x.blob})]);
    trackEvent("image_copy", {format:"png"});
    $("#imageStatus").textContent="Image copied";
  }catch{$("#imageStatus").textContent="Clipboard access unavailable"}
};
$("#downloadZip").onclick=async()=>{
  const ready=images.filter(x=>x.blob);if(!ready.length)return;
  const {default:JSZip}=await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const zip=new JSZip();ready.forEach((x,i)=>zip.file("clean-"+base(x.file.name)+"-"+(i+1)+".png",x.blob));
  $("#imageStatus").textContent="Creating ZIP…";
  const zipBlob=await zip.generateAsync({type:"blob",compression:"STORE"});
  trackEvent("image_zip_download", {count: ready.length});
  download(zipBlob,"gemini-watermark-remover.zip")
};
$("#clearImages").onclick=()=>{images.forEach(x=>{URL.revokeObjectURL(x.original);if(x.clean)URL.revokeObjectURL(x.clean)});images=[];$("#imageEditor").classList.add("hidden");$("#imageDrop").classList.remove("hidden")};

function base(n){return n.replace(/\.[^.]+$/,"")}
function download(b,n){const u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200)}

setupDrop(imageDrop,imageInput,addImages);
setupDrop(videoDrop,videoInput,loadVideo);

function setupDrop(el,input,fn){
  ["dragenter","dragover"].forEach(t=>el.addEventListener(t,e=>{e.preventDefault();el.classList.add("dragging")}));
  ["dragleave","drop"].forEach(t=>el.addEventListener(t,e=>{e.preventDefault();el.classList.remove("dragging")}));
  el.addEventListener("drop",e=>fn([...e.dataTransfer.files]));
}
videoChoose.onclick=()=>videoInput.click();
videoInput.onchange=()=>loadVideo([...videoInput.files]);

let videoFile=null,videoOutput=null,videoOutputMime="video/webm",videoOutputExt="webm";
let videoSourceUrl=null, videoProcessing=false, videoReady=false, processingVideoEl=null;

function getVideoMimePreference(){
  const choice=$("#videoOutputFormat").value;
  const isMp4=videoFile?.type?.includes("mp4");
  const isWebm=videoFile?.type?.includes("webm");
  const mp4Candidates=['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4'];
  const webmCandidates=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const supported=c=>typeof MediaRecorder!=="undefined" && MediaRecorder.isTypeSupported(c);
  const mp4=mp4Candidates.find(supported), webm=webmCandidates.find(supported);
  if(choice==="mp4" && mp4)return {mime:mp4,ext:"mp4"};
  if(choice==="webm" && webm)return {mime:webm,ext:"webm"};
  if(choice==="same"){
    if(isMp4 && mp4)return {mime:mp4,ext:"mp4"};
    if(isWebm && webm)return {mime:webm,ext:"webm"};
    if(mp4)return {mime:mp4,ext:"mp4"};
    if(webm)return {mime:webm,ext:"webm"};
  }
  if(mp4)return {mime:mp4,ext:"mp4"};
  if(webm)return {mime:webm,ext:"webm"};
  throw new Error("This browser cannot record MP4 or WebM video.");
}

function formatTime(sec){
  if(!Number.isFinite(sec)||sec<0)sec=0;
  const m=Math.floor(sec/60),s=Math.floor(sec%60);
  return `${m}:${String(s).padStart(2,"0")}`;
}
function formatBytes(n){if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;return `${(n/1024/1024).toFixed(1)} MB`}

function resetVideoPlayer(){
  const before=$("#videoBefore"),after=$("#videoAfter");
  try{before.pause();after.pause()}catch{}
  $("#videoTogglePlay").textContent="▶";
  $("#videoTogglePlay").setAttribute("aria-label", videoReady ? "Play cleaned video" : "Start watermark removal");
  $("#videoTime").textContent=`0:00 / ${formatTime(before.duration||0)}`;
  $("#videoProgressBar").style.width="0";
}

function loadVideo(files){
  const f=files.find(x=>x.type.startsWith("video/"));if(!f)return;
  if(videoOutput){URL.revokeObjectURL(videoOutput);videoOutput=null}
  if(videoSourceUrl){URL.revokeObjectURL(videoSourceUrl);videoSourceUrl=null}
  videoFile=f;videoReady=false;
  trackEvent("video_upload",{format:f.type||"unknown"});
  $("#videoDrop").classList.add("hidden");$("#videoEditor").classList.remove("hidden");

  videoSourceUrl=URL.createObjectURL(f);
  const before=$("#videoBefore");
  before.src=videoSourceUrl;before.load();
  $("#videoAfter").removeAttribute("src");
  $("#videoAfter").classList.add("hidden");
  $("#videoCanvas").classList.remove("live-preview");
  $("#videoReadyState").classList.remove("hidden");
  $("#downloadVideo").classList.add("disabled-action");
  $("#downloadVideo").disabled=true;
  $("#videoTogglePlay").classList.remove("disabled-action");
  $("#videoTogglePlay").disabled=false;
  $("#videoTogglePlay").setAttribute("aria-label","Start watermark removal");
  $("#videoStatus").textContent=`Ready · ${formatBytes(f.size)} · press play to remove the watermark`;
  resetVideoPlayer();
  requestAnimationFrame(()=>$("#videoEditor").scrollIntoView({behavior:"smooth",block:"center"}));
}

function cleanupProcessingVideo(){
  if(!processingVideoEl)return;
  try{processingVideoEl.pause();processingVideoEl.removeAttribute("src");processingVideoEl.load();processingVideoEl.remove();}catch{}
  processingVideoEl=null;
}
function clearVideoState(){
  try{$("#videoBefore").pause();$("#videoAfter").pause()}catch{}
  cleanupProcessingVideo();
  if(videoOutput){URL.revokeObjectURL(videoOutput);videoOutput=null}
  if(videoSourceUrl){URL.revokeObjectURL(videoSourceUrl);videoSourceUrl=null}
  videoFile=null;videoReady=false;videoProcessing=false;
  $("#videoBefore").removeAttribute("src");$("#videoAfter").removeAttribute("src");
  $("#downloadVideo").disabled=true;$("#downloadVideo").classList.add("disabled-action");
  $("#videoTogglePlay").disabled=true;$("#videoTogglePlay").classList.add("disabled-action");
  $("#videoEditor").classList.add("hidden");$("#videoDrop").classList.remove("hidden");
  resetVideoPlayer();
}
$("#clearVideo").onclick=clearVideoState;
$("#chooseAnotherVideo").onclick=()=>$("#videoInput").click();
$("#resetVideo").onclick=()=>{
  if(!videoFile)return;
  if(videoOutput){URL.revokeObjectURL(videoOutput);videoOutput=null}
  videoReady=false;
  $("#videoAfter").pause();$("#videoAfter").removeAttribute("src");$("#videoAfter").classList.add("hidden");
  $("#videoCanvas").classList.remove("live-preview");
  $("#videoReadyState").classList.remove("hidden");
  $("#downloadVideo").classList.add("disabled-action");
  $("#downloadVideo").disabled=true;
  $("#videoTogglePlay").classList.remove("disabled-action");
  $("#videoTogglePlay").disabled=false;
  $("#videoTogglePlay").setAttribute("aria-label","Start watermark removal");
  $("#videoStatus").textContent="Ready · press play to remove the watermark";
  resetVideoPlayer();
};
$("#downloadVideo").onclick=()=>{
  if(!videoOutput||!videoReady)return;
  trackEvent("video_download",{format:videoOutputExt});
  const a=document.createElement("a");
  a.href=videoOutput;
  a.download=`gemini-video-clean.${videoOutputExt}`;
  a.rel="noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

function syncVideoControls(source){
  const before=$("#videoBefore"),duration=source.duration||before.duration||0,current=source.currentTime||0;
  const progress=duration?(current/duration)*100:0;
  //$("#customSeekBar").style.width=progress+"%";
  $("#videoTime").textContent=`${formatTime(current)} / ${formatTime(duration)}`;
}
async function toggleProcessedVideo(){
  if(videoProcessing)return;
  if(!videoReady){
    await processVideo();
    return;
  }
  const after=$("#videoAfter");
  if(after.paused){
    after.play().catch(()=>{});
  }else{
    after.pause();
  }
}
$("#videoTogglePlay").onclick=toggleProcessedVideo;
$("#videoMute").onclick=()=>{
  const after=$("#videoAfter");after.muted=!after.muted;
  $("#videoMute").textContent=after.muted?"🔇":"🔊";
};
$("#customSeek").onclick=e=>{
  if(!videoReady)return;
  const r=e.currentTarget.getBoundingClientRect(),pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
  const after=$("#videoAfter"),t=pct*(after.duration||0);
  after.currentTime=t;
  if(Number.isFinite($("#videoBefore").duration))$("#videoBefore").currentTime=Math.min(t,$("#videoBefore").duration);
};
$("#videoAfter").addEventListener("timeupdate",()=>syncVideoControls($("#videoAfter")));
$("#videoAfter").addEventListener("play",()=>{
  $("#videoTogglePlay").textContent="❚❚";
  $("#videoTogglePlay").setAttribute("aria-label","Pause processed video");
});
$("#videoAfter").addEventListener("pause",()=>{
  $("#videoTogglePlay").textContent="▶";
  $("#videoTogglePlay").setAttribute("aria-label","Play processed video");
});
$("#videoBefore").addEventListener("loadedmetadata",()=>syncVideoControls($("#videoBefore")));
$("#videoBefore").addEventListener("timeupdate",()=>{if(!videoReady)syncVideoControls($("#videoBefore"))});

function deriveWatermarkMask(src,clean,w,h){
  let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
  const a=src.data,b=clean.data;
  for(let i=0;i<a.length;i+=4){
    const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));
    if(d>2){const p=i/4,x=p%w,y=(p/w)|0;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;count++}
  }
  if(count<20)return null;
  minX=Math.max(0,minX-3);minY=Math.max(0,minY-3);maxX=Math.min(w-1,maxX+3);maxY=Math.min(h-1,maxY+3);
  const rw=maxX-minX+1,rh=maxY-minY+1,alpha=new Float32Array(rw*rh);
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
    const si=((minY+y)*w+(minX+x))*4,ai=y*rw+x;let sum=0,n=0;
    for(let c=0;c<3;c++){
      const cleanV=b[si+c],denom=255-cleanV,diff=a[si+c]-cleanV;
      if(denom>18&&diff>1){const q=Math.max(0,Math.min(.98,diff/denom));sum+=q;n++}
    }
    alpha[ai]=n?sum/n:0;
  }
  return {x:minX,y:minY,w:rw,h:rh,alpha};
}
function applyStaticMask(frame,mask){
  const d=frame.data,{x,y,w,h,alpha}=mask;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
    const a=alpha[yy*w+xx];if(a<0.015)continue;
    const i=((y+yy)*frame.width+(x+xx))*4,inv=1-a;
    for(let c=0;c<3;c++)d[i+c]=Math.max(0,Math.min(255,Math.round((d[i+c]-a*255)/inv)));
  }
  return frame;
}

async function processVideo(){
  if(!videoFile||videoProcessing)return;
  videoProcessing=true;trackEvent("video_processing_started");
  const original=$("#videoBefore"),canvas=$("#videoCanvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
  try{
    await new Promise((resolve,reject)=>{
      if(original.readyState>=2)resolve();
      else{original.onloadedmetadata=resolve;original.onerror=reject}
    });

    const choice=getVideoMimePreference();
    videoOutputMime=choice.mime;videoOutputExt=choice.ext;
    canvas.width=original.videoWidth;canvas.height=original.videoHeight;

    cleanupProcessingVideo();
    const pv=document.createElement("video");
    pv.muted=true;pv.playsInline=true;pv.preload="auto";
    pv.style.position="fixed";pv.style.left="-10000px";pv.style.top="0";pv.style.width="1px";pv.style.height="1px";pv.style.opacity="0";pv.style.pointerEvents="none";
    pv.src=videoSourceUrl;document.body.appendChild(pv);processingVideoEl=pv;
    await new Promise((resolve,reject)=>{
      if(pv.readyState>=2)resolve();
      else{pv.onloadedmetadata=resolve;pv.onerror=reject}
    });

    const fps=Math.min(30,Math.max(15,Number(pv.dataset.fps)||30));
    const totalFrames=Math.max(1,Math.ceil((pv.duration||0)*fps));
    const stream=canvas.captureStream(fps);
    try{
      const sourceStream=pv.captureStream?pvv.captureStream():null;
      if(sourceStream)sourceStream.getAudioTracks().forEach(t=>stream.addTrack(t));
    }catch{}
    // Some browsers expose the source stream only after playback starts. We
    // still record the processed canvas video even when audio cannot be copied.
    const rec=new MediaRecorder(stream,{mimeType:choice.mime,videoBitsPerSecond:Math.max(5_000_000,Math.min(20_000_000,canvas.width*canvas.height*3))});
    const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    const done=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=reject});

    $("#videoTogglePlay").classList.add("disabled-action");
    $("#videoTogglePlay").disabled=true;
    $("#downloadVideo").classList.add("disabled-action");
    $("#downloadVideo").disabled=true;
    $("#videoTogglePlay").classList.add("disabled-action");
    $("#videoTogglePlay").disabled=true;
    $("#videoReadyState").classList.add("hidden");
    $("#videoCanvas").classList.add("live-preview");

    const seekTo=async time=>{
      time=Math.max(0,Math.min(Math.max(0,pv.duration||0),time));
      if(Math.abs((pv.currentTime||0)-time)<0.005){
        await new Promise(r=>requestAnimationFrame(r));
        return;
      }
      await new Promise((resolve,reject)=>{
        let settled=false;
        const cleanup=()=>{pv.removeEventListener("seeked",onSeek);pv.removeEventListener("error",onError)};
        const finish=fn=>{if(settled)return;settled=true;cleanup();fn()};
        const onSeek=()=>finish(resolve);
        const onError=()=>finish(()=>reject(new Error("Could not seek video frame.")));
        pv.addEventListener("seeked",onSeek,{once:true});
        pv.addEventListener("error",onError,{once:true});
        pv.currentTime=time;
      });
    };

    const runEngineOnCurrentFrame=async()=>{
      ctx.drawImage(pv,0,0,canvas.width,canvas.height);
      const source=ctx.getImageData(0,0,canvas.width,canvas.height);
      const result=await removeWatermarkFromImageData(
        new ImageData(new Uint8ClampedArray(source.data),source.width,source.height),
        {engine:await getEngine(),adaptiveMode:"auto"}
      );
      return {source,result};
    };

    $("#videoStatus").textContent="Scanning video frames for the watermark…";
    await seekTo(0);
    let analyzed=await runEngineOnCurrentFrame();
    let mask=deriveWatermarkMask(analyzed.source,analyzed.result.imageData,canvas.width,canvas.height);
    if(mask){
      ctx.putImageData(analyzed.result.imageData,0,0);
    }else{
      const sampleTimes=[.12,.25,.40,.55,.70,.85].map(p=>p*(pv.duration||0));
      for(let i=0;i<sampleTimes.length&&!mask;i++){
        await seekTo(sampleTimes[i]);
        analyzed=await runEngineOnCurrentFrame();
        mask=deriveWatermarkMask(analyzed.source,analyzed.result.imageData,canvas.width,canvas.height);
        ctx.putImageData(analyzed.result.imageData,0,0);
        $("#videoStatus").textContent=`Scanning watermark… ${i+2}/${sampleTimes.length+1}`;
      }
    }

    const perFrameEngine=!mask;
    if(mask){
      $("#videoStatus").textContent=`Watermark detected · ${mask.w}×${mask.h} region · exporting video…`;
    }else{
      $("#videoStatus").textContent=`Cleaning video frames individually · exporting video…`;
    }

    rec.start(250);
    let processedFrames=0;
    // Process a deterministic frame timeline instead of relying on video
    // playback callbacks. This prevents export from stopping around 90% when
    // the processing work takes longer than real-time playback.
    for(let frameIndex=0;frameIndex<totalFrames;frameIndex++){
      const t=Math.min(Math.max(0,pv.duration||0), frameIndex/Math.max(1,totalFrames-1)*(pv.duration||0));
      await seekTo(t);
      ctx.drawImage(pv,0,0,canvas.width,canvas.height);
      let frame=ctx.getImageData(0,0,canvas.width,canvas.height);
      if(perFrameEngine){
        const result=await removeWatermarkFromImageData(
          new ImageData(new Uint8ClampedArray(frame.data),frame.width,frame.height),
          {engine:await getEngine(),adaptiveMode:"auto"}
        );
        frame=result.imageData;
      }else{
        applyStaticMask(frame,mask);
      }
      ctx.putImageData(frame,0,0);
      processedFrames=frameIndex+1;
      const progress=Math.round((processedFrames/totalFrames)*100);
      $("#videoProgressBar").style.width=progress+"%";
      $("#videoStatus").textContent=`Exporting video, processed ${processedFrames} of ${totalFrames} frames (${progress}%) · ${choice.ext.toUpperCase()}`;
    }

    // Hold the final cleaned frame briefly so MediaRecorder flushes it.
    await new Promise(r=>setTimeout(r,150));
    try{rec.stop()}catch{}
    await done;

    const outputBlob=new Blob(chunks,{type:choice.mime.split(";")[0]});
    if(!outputBlob.size)throw new Error("The cleaned video is empty.");
    videoOutput=URL.createObjectURL(outputBlob);

    const after=$("#videoAfter");
    after.src=videoOutput;after.load();after.classList.remove("hidden");
    $("#videoCanvas").classList.remove("live-preview");
    $("#videoReadyState").classList.add("hidden");
    $("#downloadVideo").classList.remove("disabled-action");
    $("#downloadVideo").disabled=false;
    $("#videoTogglePlay").classList.remove("disabled-action");
    $("#videoTogglePlay").disabled=false;
    $("#videoProgressBar").style.width="100%";
    $("#videoStatus").textContent=`Finished · ${choice.ext.toUpperCase()} · processed ${processedFrames} frames · download ready`;
    const downloadLabel=$("#downloadVideo span");
    if(downloadLabel)downloadLabel.textContent=`Download ${choice.ext.toUpperCase()}`;
    videoReady=true;
    after.currentTime=0;
    after.pause();
    original.pause();original.currentTime=0;
    $("#videoTogglePlay").textContent="▶";
    $("#videoTogglePlay").setAttribute("aria-label","Play cleaned video");
    requestAnimationFrame(()=>$("#videoEditor").scrollIntoView({behavior:"smooth",block:"center"}));
  }catch(e){
    console.error(e);trackEvent("video_processing_error");
    $("#videoStatus").textContent=`Video export failed: ${e.message||e}`;
    $("#videoReadyState").classList.remove("hidden");$("#videoCanvas").classList.remove("live-preview");
    $("#videoTogglePlay").classList.remove("disabled-action");
    $("#videoTogglePlay").disabled=false;
    $("#videoTogglePlay").setAttribute("aria-label","Start watermark removal");
  }finally{
    cleanupProcessingVideo();
    videoProcessing=false;
  }
}

function downloadUrl(url,name){
  const a=document.createElement("a");a.href=url;a.download=name;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();
}
