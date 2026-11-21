import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,offers,tasks,taskStatus,pricing,campaignSVG} from '../campaign/replay.js';
test('campaign gates require actual human option choice and approval',()=>{
 let s=initialState();assert.equal(transition(s,{type:'start',brief:'  '}).stage,0);
 s=transition(s,{type:'start',brief:'Launch our 5G offer'});s=transition(s,{type:'step'});assert.equal(s.stage,2);
 assert.equal(transition(s,{type:'step'}).stage,2);assert.equal(transition(s,{type:'approve'}).stage,2);
 assert.equal(transition(s,{type:'choose',choice:'UNKNOWN'}).stage,2);
 s=transition(s,{type:'choose',choice:'MATCH'});for(let i=0;i<12;i++)s=transition(s,{type:'step'});
 assert.equal(s.stage,8);assert.equal(s.choice,'MATCH');assert.equal(taskStatus(tasks[0],s),'Review');
 s=transition(s,{type:'approve'});assert.equal(s.stage,9);assert.ok(tasks.every(t=>taskStatus(t,s)==='Done'));
 assert.deepEqual(transition(s,{type:'reset'}),initialState());
});
test('all offer branches produce corresponding facts, arithmetic and three deterministic formats',()=>{
 for(const [choice,o]of Object.entries(offers)){
  const p=pricing(choice);assert.equal(p.contribution,p.revenue-p.cost);assert.equal(p.revenue,o.price*1000);
  for(const format of ['square','story','banner']) {const svg=campaignSVG(choice,format);assert.match(svg,new RegExp(`${o.data} GB`));assert.match(svg,new RegExp(`€${o.price} / month`));assert.match(svg,/Synthetic offer/);assert.equal(svg,campaignSVG(choice,format));assert.doesNotMatch(svg,/Qvantel|Nordwave|NORA/);}
 }
});
test('play pauses at the choice and final approval gates',()=>{
 let s=transition(initialState(),{type:'start',brief:'5G'});s=transition(s,{type:'play'});assert.equal(s.playing,true);s=transition(s,{type:'step'});assert.equal(s.playing,false);assert.equal(transition(s,{type:'play'}).playing,false);
 s=transition(s,{type:'choose',choice:'VALUE'});s=transition(s,{type:'play'});while(s.stage<8)s=transition(s,{type:'step'});assert.equal(s.playing,false);
});
