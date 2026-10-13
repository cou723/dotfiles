// Test-only provider. Never installed as a normal Pi resource and performs no I/O.
import { AssistantMessageEventStream } from '@earendil-works/pi-ai';
export default function (pi) {
  pi.registerProvider('subagent-test', {
    apiKey: 'test-only', api: 'subagent-test', baseUrl: 'https://invalid.example',
    models: [{ id:'test', name:'Subagent test', reasoning:false, input:['text'],
      contextWindow:8192, maxTokens:1024,
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0} }],
    streamSimple(model, context) {
      const stream = new AssistantMessageEventStream();
      const leaked = context.messages.some(m => JSON.stringify(m).includes('PARENT_HISTORY_CANARY'));
      const message = { role:'assistant', provider:model.provider, api:model.api, model:model.id,
        timestamp:Date.now(), content:[{type:'text',text:leaked?'LEAK':'FRESH_CHILD_OK'}], stopReason:'stop',
        usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,
          cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}} };
      queueMicrotask(() => { stream.push({type:'start',partial:message}); stream.push({type:'done',reason:'stop',message}); stream.end(); });
      return stream;
    },
  });
}
