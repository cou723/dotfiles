// Local deterministic JSON-RPC fixture: no network, files, or model calls.
let buffer=Buffer.alloc(0);
const docs=new Map();
function send(message){const body=Buffer.from(JSON.stringify({jsonrpc:'2.0',...message}));process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);process.stdout.write(body);}
function publish(uri,version,error){send({method:'textDocument/publishDiagnostics',params:{uri,version,diagnostics:error?[{range:{start:{line:0,character:0},end:{line:0,character:1}},severity:1,message:'fixture type error'}]:[]}});}
function handle(m){
 if(m.method==='initialize')return send({id:m.id,result:{capabilities:{textDocumentSync:{openClose:true,change:1,save:true},documentSymbolProvider:true,hoverProvider:true}}});
 if(m.method==='textDocument/didOpen'||m.method==='textDocument/didChange'){
  const d=m.params.textDocument, text=d.text??m.params.contentChanges[0].text;
  docs.set(d.uri,{version:d.version,text});
  if(text.includes('silent'))return;
  if(text.includes('delay-clean'))setTimeout(()=>publish(d.uri,d.version-1,true),20);
  setTimeout(()=>publish(d.uri,d.version,text.includes('error')),text.includes('delay-clean')?450:50);
  return;
 }
 if(m.method==='shutdown')return send({id:m.id,result:null});
 if(m.method==='exit')return process.exit(0);
 if(m.id!==undefined)send({id:m.id,result:m.method==='textDocument/hover'?{contents:'fixture hover'}:[]});
}
process.stdin.on('data',chunk=>{
 buffer=Buffer.concat([buffer,chunk]);
 while(true){
  const end=buffer.indexOf('\r\n\r\n');if(end<0)return;
  const match=buffer.subarray(0,end).toString().match(/Content-Length:\s*(\d+)/i);if(!match)process.exit(2);
  const size=Number(match[1]);if(buffer.length<end+4+size)return;
  const message=JSON.parse(buffer.subarray(end+4,end+4+size).toString());buffer=buffer.subarray(end+4+size);handle(message);
 }
});
