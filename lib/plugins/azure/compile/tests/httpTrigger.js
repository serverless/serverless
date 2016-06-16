'use strict';

 const expect = require('chai').expect;
 const httpTrigger = require('../lib/httpTrigger');

 const mockFunctionObject = {
   provider: {
     azure: {
       disabled: false,
     }
   },
   events: {
     azure: {
       http_endpoint: {
         name: "test",
         direction: "in"
       }
     }
   }
 };

 describe('#httpTrigger', () => {
   it('builds an inbound binding template', () => {
     const inboundBindingTemplate = httpTrigger.getInboundBindingTemplate();
     const inboundBindingKeys = Object.keys(inboundBindingTemplate);

     expect(inboundBindingKeys).to.include.members([
       "type",
       "webHookType",
       "name",
       "direction",
       "authLevel"
     ]);

     expect(inboundBindingTemplate["type"]).to.equal("httpTrigger");  
     expect(inboundBindingTemplate["direction"]).to.equal("in");
     expect(inboundBindingTemplate["webHookType"]).to.equal("");
   });

   it('builds an outbound binding template', () => {
     const outboundBindingTemplate = httpTrigger.getOutboundBindingTemplate();
     const outboundBindingKeys = Object.keys(outboundBindingTemplate);

     expect(outboundBindingKeys).to.include.members([
       "name",
       "type",
       "direction"
     ]);

     expect(outboundBindingTemplate["type"]).to.equal("http");
     expect(outboundBindingTemplate["direction"]).to.equal("out");
   });

   it('builds a trigger template', () => {
     const triggerTemplate = httpTrigger.getTriggerTemplate();
     expect(triggerTemplate["bindings"]).to.be.empty;
     expect(triggerTemplate["disabled"]).to.be.false;
   });

   it('builds a templated http trigger', () => {
     const triggerJSON = httpTrigger.buildFunctionJSON(mockFunctionObject);
     expect(triggerJSON.disabled).to.equal(mockFunctionObject.provider.azure.disabled);
     expect(triggerJSON.bindings.length).to.equal(2);
   });
 });