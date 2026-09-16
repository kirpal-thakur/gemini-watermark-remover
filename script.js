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

imageMode.onclick=()=>switchMode("image");
videoMode.onclick=()=>switchMode("video");
function switchMode(mode){
  imageMode.classList.toggle("active",mode==="image");
  videoMode.classList.toggle("active",mode==="video");
  imageTool.classList.toggle("active-tool",mode==="image");
  videoTool.classList.toggle("active-tool",mode==="video");
}

imageChoose.onclick=()=>imageInput.click();
$("#addImages").onclick=()=>imageInput.click();
imageInput.onchange=()=>{addImages([...imageInput.files]);imageInput.value=""};

function addImages(files){
  files=files.filter(f=>["image/png","image/jpeg","image/webp"].includes(f.type));
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
  if(!images[i])return;selected=i;
  $("#before").src=images[i].original;$("#after").src=images[i].clean||images[i].original;
  document.querySelectorAll(".thumb").forEach((x,n)=>x.classList.toggle("selected",n===i));
  setSlider(50);
  $("#imageStatus").textContent=images[i].clean?(images[i].applied?"Watermark removed locally":"No supported watermark detected"):"Processing…";
}
async function processImage(i){
  try{
    const x=images[i],bitmap=await createImageBitmap(x.file),canvas=document.createElement("canvas");
    canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext("2d").drawImage(bitmap,0,0);bitmap.close();
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const result=await removeWatermarkFromImageData(ctx.getImageData(0,0,canvas.width,canvas.height),{engine:await getEngine(),adaptiveMode:"auto"});
    const out=document.createElement("canvas");out.width=result.imageData.width;out.height=result.imageData.height;
    out.getContext("2d").putImageData(result.imageData,0,0);
    x.blob=await blob(out);x.clean=URL.createObjectURL(x.blob);x.applied=Boolean(result.meta?.applied);
    if(i===selected)selectImage(i);
  }catch(e){console.error(e);if(i===selected)$("#imageStatus").textContent="Processing failed";}
}
function getEngine(){if(!enginePromise)enginePromise=createWatermarkEngine();return enginePromise}
function blob(c){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("encode failed")),"image/png"))}

const stage=document.querySelector(".compare"),slider=$("#compareSlider"),pane=$("#afterPane");
function setSlider(p){p=Math.max(0,Math.min(100,p));slider.style.left=p+"%";pane.style.width=p+"%"}
function pct(x){const r=stage.getBoundingClientRect();return (x-r.left)/r.width*100}
slider.onpointerdown=e=>{sliderDragging=true;slider.setPointerCapture(e.pointerId);e.preventDefault()};
slider.onpointermove=e=>{if(sliderDragging)setSlider(pct(e.clientX))};
slider.onpointerup=slider.onpointercancel=()=>sliderDragging=false;
stage.onpointerdown=e=>{if(!e.target.closest(".compare-slider"))setSlider(pct(e.clientX))};

$("#downloadImage").onclick=()=>{
  const x=images[selected];if(x?.blob)download(x.blob,"gemini-clean-"+base(x.file.name)+".png")
};
$("#copyImage").onclick=async()=>{
  const x=images[selected];if(!x?.blob)return;
  try{await navigator.clipboard.write([new ClipboardItem({"image/png":x.blob})]);$("#imageStatus").textContent="Image copied"}catch{$("#imageStatus").textContent="Clipboard access unavailable"}
};
$("#downloadZip").onclick=async()=>{
  const ready=images.filter(x=>x.blob);if(!ready.length)return;
  const {default:JSZip}=await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm");
  const zip=new JSZip();ready.forEach((x,i)=>zip.file("clean-"+base(x.file.name)+"-"+(i+1)+".png",x.blob));
  $("#imageStatus").textContent="Creating ZIP…";download(await zip.generateAsync({type:"blob",compression:"STORE"}),"gemini-watermark-remover.zip")
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
function loadVideo(files){
  const f=files.find(x=>x.type.startsWith("video/"));if(!f)return;
  if(videoOutput){URL.revokeObjectURL(videoOutput);videoOutput=null}
  videoFile=f;$("#videoDrop").classList.add("hidden");$("#videoEditor").classList.remove("hidden");
  $("#videoBefore").src=URL.createObjectURL(f);$("#videoAfter").removeAttribute("src");
  $("#downloadVideo").classList.add("disabled-action");$("#videoProgressBar").style.width="0";
  $("#videoStatus").textContent=`Ready · ${formatBytes(f.size)}`;
}
$("#clearVideo").onclick=()=>{videoOutput&&URL.revokeObjectURL(videoOutput);videoOutput=null;videoFile=null;$("#videoBefore").removeAttribute("src");$("#videoAfter").removeAttribute("src");$("#videoEditor").classList.add("hidden");$("#videoDrop").classList.remove("hidden");$("#videoProgressBar").style.width="0"};
$("#processVideo").onclick=processVideo;
$("#downloadVideo").onclick=()=>{if(videoOutput)downloadUrl(videoOutput,`gemini-video-clean.${videoOutputExt}`)};

function formatBytes(n){if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;return `${(n/1024/1024).toFixed(1)} MB`}
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
    const si=((minY+y)*w+(minX+x))*4, ai=y*rw+x;let sum=0,n=0;
    for(let c=0;c<3;c++){
      const cleanV=b[si+c], denom=255-cleanV, diff=a[si+c]-cleanV;
      if(denom>18 && diff>1){const q=Math.max(0,Math.min(.98,diff/denom));sum+=q;n++}
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
  if(!videoFile)return;
  const v=$("#videoBefore"),canvas=$("#videoCanvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
  try{
    await new Promise((resolve,reject)=>{if(v.readyState>=2)resolve();else{v.onloadedmetadata=resolve;v.onerror=reject}});
    const choice=getVideoMimePreference();videoOutputMime=choice.mime;videoOutputExt=choice.ext;
    canvas.width=v.videoWidth;canvas.height=v.videoHeight;
    const fps=Math.min(30,Math.max(15,Number(v.dataset.fps)||30));
    const stream=canvas.captureStream(fps);
    try{const sourceStream=v.captureStream?v.captureStream():null;if(sourceStream)sourceStream.getAudioTracks().forEach(t=>stream.addTrack(t))}catch{}
    const rec=new MediaRecorder(stream,{mimeType:choice.mime,videoBitsPerSecond:Math.max(5_000_000,Math.min(20_000_000,canvas.width*canvas.height*3))});
    const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    const done=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=reject});
    $("#processVideo").classList.add("disabled-action");$("#downloadVideo").classList.add("disabled-action");
    $("#videoStatus").textContent="Analyzing the first frame…";
    v.currentTime=0;await new Promise(r=>{const f=()=>{v.removeEventListener("seeked",f);r()};v.addEventListener("seeked",f);v.currentTime=0});
    ctx.drawImage(v,0,0,canvas.width,canvas.height);
    const first=ctx.getImageData(0,0,canvas.width,canvas.height),firstCopy=new ImageData(new Uint8ClampedArray(first.data),first.width,first.height);
    const result=await removeWatermarkFromImageData(firstCopy,{engine:await getEngine(),adaptiveMode:"auto"});
    const mask=deriveWatermarkMask(first,result.imageData,canvas.width,canvas.height);
    if(!mask){ctx.putImageData(result.imageData,0,0);$("#videoStatus").textContent="No supported visible watermark detected.";return}
    ctx.putImageData(result.imageData,0,0);
    $("#videoStatus").textContent=`Watermark detected · ${mask.w}×${mask.h} region · exporting ${choice.ext.toUpperCase()}…`;
    rec.start(250);
    let ended=false,processing=false,lastShown=-1;
    const drawFrame=async()=>{
      if(ended||processing)return;
      processing=true;
      try{
        ctx.drawImage(v,0,0,canvas.width,canvas.height);
        const frame=ctx.getImageData(0,0,canvas.width,canvas.height);applyStaticMask(frame,mask);ctx.putImageData(frame,0,0);
        const progress=Math.min(100,(v.currentTime/v.duration)*100);$("#videoProgressBar").style.width=progress+"%";
        const sec=Math.floor(v.currentTime);if(sec!==lastShown){lastShown=sec;$("#videoStatus").textContent=`Removing watermark… ${Math.round(progress)}% · ${choice.ext.toUpperCase()}`}
      }catch(e){console.warn(e)}finally{processing=false}
      if(v.ended||v.currentTime>=v.duration-0.03){ended=true;try{rec.stop()}catch{};return}
      if("requestVideoFrameCallback" in HTMLVideoElement.prototype){v.requestVideoFrameCallback(()=>drawFrame())}else{setTimeout(drawFrame,1000/fps)}
    };
    await v.play();
    if("requestVideoFrameCallback" in HTMLVideoElement.prototype)v.requestVideoFrameCallback(()=>drawFrame());else{setTimeout(drawFrame,0)}
    await done;
    videoOutput=URL.createObjectURL(new Blob(chunks,{type:choice.mime.split(";")[0]}));$("#videoAfter").src=videoOutput;$("#downloadVideo").classList.remove("disabled-action");
    $("#videoProgressBar").style.width="100%";$("#videoStatus").textContent=`Finished · ${choice.ext.toUpperCase()} · watermark mask reused across frames`;
  }catch(e){console.error(e);$("#videoStatus").textContent=`Video export failed: ${e.message||e}`}
  finally{$("#processVideo").classList.remove("disabled-action")}
}
function downloadUrl(url,name){const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove()}
