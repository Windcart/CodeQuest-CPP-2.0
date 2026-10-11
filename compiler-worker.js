/* C++ compiles and runs only in this disposable worker and WASI memory. */
importScripts('./compiler/clang-wasm-toolchain.global.js');
let toolchain, busy=false;
self.onmessage=async({data})=>{
 if(busy)return;busy=true;
 try{
  if(typeof data.code!=='string'||data.code.length>50000)throw Error('Keep programs below 50,000 characters.');
  if(!Array.isArray(data.inputs)||data.inputs.length>8||data.inputs.some(x=>typeof x!=='string'||x.length>10000))throw Error('Invalid program input.');
  if(!toolchain){self.postMessage({kind:'loading',progress:0});toolchain=await self.clangWasmToolchain.createToolchain({baseUrl:new URL('./compiler/',self.location.href).href,onProgress:v=>self.postMessage({kind:'loading',progress:v})});}
  self.postMessage({kind:'compiling'});
  const start=performance.now();
  const built=await toolchain.captureCompilerOutput(()=>toolchain.runtime.compileArtifact(data.code,{language:'CPP',fileName:'mission.cpp',compileArgs:['-std=c++17','-fgnuc-version=4.2.1','-Wall','-ferror-limit','6']}));
  if(built.error){let errors=self.clangWasmToolchain.compilerDiagnostics(built.raw);if(!errors.length)errors=[String(built.error.message||built.error)];self.postMessage({kind:'result',errors,results:[]});return;}
  const results=[];
  for(let i=0;i<data.inputs.length;i++){
   self.postMessage({kind:'running',test:i});let input=data.inputs[i],used=false,stdout='',stderr='',bytes=0;
   const output=(chunk,err)=>{bytes+=chunk.length;if(bytes>100000)throw Error('Output limit reached. Check for a loop that prints forever.');if(err)stderr+=chunk;else stdout+=chunk;};
   const r=await toolchain.execute(built.result,{args:[],stdin:()=>{if(used)return null;used=true;return input;},stdout:c=>output(c,false),stderr:c=>output(c,true)});
   results.push({stdout,stderr,exitCode:r.exitCode});
  }
  self.postMessage({kind:'result',errors:[],results,elapsed:Math.round(performance.now()-start)});
 }catch(e){self.postMessage({kind:'result',errors:[String(e.message||e)],results:[]});}
 finally{busy=false;}
};
