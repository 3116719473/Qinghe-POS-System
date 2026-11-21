import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PosStore} from '../src/store.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
const purchase=(s,extra={})=>s.checkout({items:[{productId:'p1',quantity:2},{productId:'p3',quantity:1}],cash:2000,requestKey:'checkout-test-001',...extra});
test('Discounted unit prices round to cents; refunds use paid prices',()=>{
 const s=new PosStore();try{const sale=purchase(s,{discountPercent:85});assert.equal(sale.total,936);assert.equal(sale.items[0].price,383);assert.equal(sale.items[0].original_price,450);assert.equal(sale.discount_percent,85);assert.equal(sale.change,1064);const refunded=s.refund(sale.id,{items:[{itemId:sale.items[0].id,quantity:1}],reason:'Return',requestKey:'discount-refund-1'});assert.equal(refunded.refunded,383);for(const discountPercent of [0,101,99.5]) assert.throws(()=>purchase(s,{discountPercent,requestKey:'invalid-discount'}),/percentage/);}finally{s.close();}
});
test('External payments require references and exact amounts',()=>{
 const s=new PosStore();try{assert.throws(()=>purchase(s,{paymentMethod:'wechat'}),/reference/);assert.throws(()=>purchase(s,{paymentMethod:'card',paymentReference:'BANK-001',cash:2000}),/equal the amount due/);for(const paymentMethod of ['wechat','alipay','card']){const sale=purchase(s,{paymentMethod,paymentReference:'EXTERNAL-001',cash:1100,requestKey:'pay-'+paymentMethod});assert.equal(sale.payment_method,paymentMethod);assert.equal(sale.payment_reference,'EXTERNAL-001');assert.equal(sale.change,0);}assert.equal(s.sales().length,3);}finally{s.close();}
});
test('Internal barcodes have valid EAN-13 check digits',()=>{
 const s=new PosStore();try{const codes=s.products().map(p=>p.barcode);assert.equal(new Set(codes).size,codes.length);for(const code of codes){assert.match(code,/^20\d{11}$/);assert.equal([...code].reduce((a,n,i)=>a+Number(n)*(i%2?3:1),0)%10,0);}}finally{s.close();}
});
test('Legacy schema migration preserves historical prices',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'qinghe-migration-'));let s;try{const file=path.join(dir,'old.sqlite');const db=new DatabaseSync(file);db.exec("CREATE TABLE sales(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,total INTEGER NOT NULL,cash INTEGER NOT NULL,change INTEGER NOT NULL,request_key TEXT UNIQUE NOT NULL); CREATE TABLE sale_items(id INTEGER PRIMARY KEY,sale_id TEXT NOT NULL,product_id TEXT NOT NULL,name TEXT NOT NULL,barcode TEXT NOT NULL,unit TEXT NOT NULL,price INTEGER NOT NULL,quantity INTEGER NOT NULL,returned INTEGER NOT NULL DEFAULT 0); INSERT INTO sales VALUES('old','2026-11-10T00:00:00Z',450,500,50,'old-request'); INSERT INTO sale_items VALUES(1,'old','p1','Milk','6901001000011','box',450,1,0);");db.close();s=new PosStore(file);const sale=s.sale('old');assert.equal(sale.total,450);assert.equal(sale.payment_method,'cash');assert.equal(sale.discount_percent,100);assert.equal(sale.items[0].original_price,450);assert.equal(sale.items[0].barcode,'6901001000011');}finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('Cash checkout, change, stock deduction and idempotency',()=>{
 const s=new PosStore();try{const sale=purchase(s);assert.equal(sale.total,1100);assert.equal(sale.change,900);assert.equal(s.products().find(p=>p.id==='p1').stock,84);assert.equal(purchase(s).id,sale.id);assert.equal(s.sales().length,1);assert.equal(s.products().find(p=>p.id==='p1').stock,84);assert.equal(s.logs().length,2);}finally{s.close();}
});
test('Invalid sales do not change orders or stock',()=>{
 const s=new PosStore();try{assert.throws(()=>purchase(s,{cash:100}),/Insufficient cash/);assert.throws(()=>purchase(s,{items:[{productId:'p1',quantity:1},{productId:'p3',quantity:999}],cash:1000000}),/ insufficient stock/);assert.throws(()=>purchase(s,{items:[{productId:'p1',quantity:1},{productId:'p1',quantity:1}]}),/duplicate/);assert.equal(s.sales().length,0);assert.equal(s.products()[0].stock,86);assert.equal(s.logs().length,0);}finally{s.close();}
});
test('Partial returns use historical prices and cannot exceed sold quantities',()=>{
 const s=new PosStore();try{const sale=purchase(s);const milk=sale.items.find(p=>p.product_id==='p1');s.saveProduct({...s.products()[0],price:999},'p1');const data={items:[{itemId:milk.id,quantity:1}],reason:'Wrong item purchased',requestKey:'refund-test-001'};let updated=s.refund(sale.id,data);assert.equal(updated.refunded,450);assert.equal(s.products()[0].stock,85);assert.equal(s.refund(sale.id,data).refunded,450);assert.equal(s.products()[0].stock,85);assert.throws(()=>s.refund(sale.id,{...data,items:[{itemId:milk.id,quantity:2}],requestKey:'refund-test-002'}),/exceeds the returnable/);updated=s.refund(sale.id,{...data,requestKey:'refund-test-003'});assert.equal(updated.refunded,900);assert.equal(s.products()[0].stock,86);const water=sale.items.find(p=>p.product_id==='p3');updated=s.refund(sale.id,{...data,items:[{itemId:water.id,quantity:1}],requestKey:'refund-test-004'});assert.equal(updated.refunded,1100);assert.equal(s.summary().net,0);assert.equal(updated.refunds.length,3);}finally{s.close();}
});
test('One invalid return item rolls back the whole return',()=>{
 const s=new PosStore();try{const sale=purchase(s);assert.throws(()=>s.refund(sale.id,{items:[{itemId:sale.items[0].id,quantity:1},{itemId:9999,quantity:1}],reason:'Return',requestKey:'refund-rollback'}),/does not belong/);assert.equal(s.sale(sale.id).refunded,0);assert.equal(s.products()[0].stock,84);}finally{s.close();}
});
test('Product validation and stock adjustment',()=>{
 const s=new PosStore();try{assert.throws(()=>s.adjust('p1',{delta:-999,reason:'Damaged'}),/stock must/);assert.throws(()=>s.adjust('p1',{delta:1.5,reason:'Restock'}),/integer/);s.adjust('p1',{delta:10,reason:'Restock'});assert.equal(s.products()[0].stock,96);assert.throws(()=>s.saveProduct({...s.products()[0],name:'Duplicate barcode'}),/already exists/);const p=s.saveProduct({name:'Test product',barcode:'1234567890123',category:'Household',price:123,stock:4,unit:'units'});assert.equal(p.stock,4);assert.throws(()=>s.saveProduct({...p,price:-1},p.id),/Price/);assert.throws(()=>s.saveProduct({...p,stock:-1,barcode:'1234567890124'}),/Opening stock/);}finally{s.close();}
});
test('Orders and stock persist after reopening the database',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'qinghe-pos-'));let s;try{const file=path.join(dir,'test.sqlite');s=new PosStore(file);const sale=purchase(s);s.close();s=new PosStore(file);assert.equal(s.sale(sale.id).total,1100);assert.equal(s.products()[0].stock,84);assert.equal(s.sales().length,1);}finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});
test('Cross-order returns and invalid quantities are rejected',()=>{
 const s=new PosStore();try{const a=purchase(s);const b=purchase(s,{requestKey:'checkout-other'});assert.throws(()=>s.refund(a.id,{items:[{itemId:b.items[0].id,quantity:1}],reason:'Return',requestKey:'refund-other'}),/does not belong/);for(const quantity of [0,-1,1.2,NaN,Infinity])assert.throws(()=>purchase(s,{requestKey:'invalid-quantity',items:[{productId:'p1',quantity}]}),/positive integer/);assert.equal(s.sales().length,2);}finally{s.close();}
});
