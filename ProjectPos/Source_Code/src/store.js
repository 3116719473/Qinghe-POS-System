import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import legacy from './legacy-catalog.json' with { type: 'json' };
const legacyLabel = value => legacy.labels[value] || value;

export class BusinessError extends Error {}
const check = (ok, message) => { if (!ok) throw new BusinessError(message); };
const integer = (n, min, max = 1000000) => Number.isSafeInteger(n) && n >= min && n <= max;
const stamp = () => new Date().toISOString();
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export class PosStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, barcode TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), stock INTEGER NOT NULL CHECK(stock>=0), unit TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, total INTEGER NOT NULL, cash INTEGER NOT NULL, change INTEGER NOT NULL, request_key TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), product_id TEXT NOT NULL REFERENCES products(id), name TEXT NOT NULL, barcode TEXT NOT NULL, unit TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL, returned INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS refunds (id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), created_at TEXT NOT NULL, total INTEGER NOT NULL, reason TEXT NOT NULL, request_key TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS refund_items (refund_id TEXT NOT NULL REFERENCES refunds(id), sale_item_id INTEGER NOT NULL REFERENCES sale_items(id), quantity INTEGER NOT NULL, amount INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS stock_logs (id INTEGER PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), created_at TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL);
    `);
    const columns=this.db.prepare('PRAGMA table_info(sales)').all().map(c=>c.name);
    if(!columns.includes('payment_method')) this.db.exec("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'; ALTER TABLE sales ADD COLUMN payment_reference TEXT NOT NULL DEFAULT ''; ALTER TABLE sales ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 100;");
    if(!this.db.prepare('PRAGMA table_info(sale_items)').all().some(c=>c.name==='original_price')) {
      this.db.exec('ALTER TABLE sale_items ADD COLUMN original_price INTEGER NOT NULL DEFAULT 0; UPDATE sale_items SET original_price=price;');
    }
    if (!this.db.prepare('SELECT COUNT(*) n FROM products').get().n) this.seed();
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
    if(!this.db.prepare('SELECT name FROM migrations WHERE name=?').get('english-catalog-v1')) this.transaction(()=>{
      for(const item of legacy.names) this.db.prepare('UPDATE products SET name=? WHERE id=? AND name=?').run(item.name,item.id,item.old);
      for(const [old,name] of Object.entries(legacy.categories)) this.db.prepare('UPDATE products SET category=? WHERE category=?').run(name,old);
      for(const [old,name] of Object.entries(legacy.units)) this.db.prepare('UPDATE products SET unit=? WHERE unit=?').run(name,old);
      this.db.prepare('INSERT INTO migrations VALUES (?)').run('english-catalog-v1');
    });
    // Replace only original sample barcodes; custom product data and historic receipts stay intact.
    const internalCodes=['204837192650','209173648205','203628519407','207492183560','205819367204','201394785620','208562047193','206730192845','202947516380','204162839507','207318564092','209580231746','203861479205','205274906138','208136025479','206493781052'];
    this.transaction(()=>internalCodes.forEach((prefix,i)=>{
      const checksum=(10-[...prefix].reduce((sum,n,j)=>sum+Number(n)*(j%2?3:1),0)%10)%10;
      const p=this.db.prepare('SELECT barcode FROM products WHERE id=?').get(`p${i+1}`);
      if(p && /^690100100\d{4}$/.test(p.barcode) && !this.db.prepare('SELECT id FROM products WHERE barcode=?').get(prefix+checksum)) this.db.prepare('UPDATE products SET barcode=? WHERE id=?').run(prefix+checksum,`p${i+1}`);
    }));
  }
  seed() {
    const rows = [
      ['6901001000011','Fresh milk 250ml','Dairy & drinks',450,86,'box','milk','blue'],
      ['6901001000028','Plain yogurt 180g','Dairy & drinks',650,48,'cup','yogurt','pink'],
      ['6901001000035','Mineral water 550ml','Dairy & drinks',200,120,'bottle','water','blue'],
      ['6901001000042','Oolong tea 500ml','Dairy & drinks',600,56,'bottle','tea','green'],
      ['6901001000059','Bananas','Fruit & vegetables',890,35,'portion','banana','yellow'],
      ['6901001000066','Fuji apples','Fruit & vegetables',1280,42,'portion','apple','pink'],
      ['6901001000073','Fresh broccoli','Fruit & vegetables',690,24,'portion','broccoli','green'],
      ['6901001000080','Cherry tomatoes 500g','Fruit & vegetables',990,32,'box','tomato','pink'],
      ['6901001000097','Original crisps 70g','Snacks',750,65,'pack','chips','yellow'],
      ['6901001000103','Butter cookies 100g','Snacks',1290,28,'box','cookie','yellow'],
      ['6901001000110','Dark chocolate 60g','Snacks',1590,8,'bar','chocolate','brown'],
      ['6901001000127','Wholemeal bread 400g','Grocery & bakery',1390,22,'bag','bread','yellow'],
      ['6901001000134','Premium rice 2.5kg','Grocery & bakery',2990,36,'bag','rice','green'],
      ['6901001000141','Fresh eggs (10 pack)','Grocery & bakery',1590,30,'box','eggs','yellow'],
      ['6901001000158','Tissues (3 pack)','Household',1190,45,'pack','tissue','blue'],
      ['6901001000165','Hand wash 300ml','Household',1690,6,'bottle','soap','green']
    ];
    const insert = this.db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)');
    this.transaction(() => rows.forEach((r,i) => insert.run(`p${i+1}`, ...r)));
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  products() { return this.db.prepare('SELECT * FROM products ORDER BY rowid').all(); }
  sale(id) {
    const sale = this.db.prepare('SELECT * FROM sales WHERE id=?').get(id);
    check(sale, 'Order not found');
    sale.items = this.db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(id);
    sale.items= sale.items.map(item=>({...item,name:legacyLabel(item.name),unit:legacyLabel(item.unit)}));
    sale.refunds = this.db.prepare('SELECT * FROM refunds WHERE sale_id=? ORDER BY created_at DESC').all(id);
    for (const refund of sale.refunds) { refund.reason=legacyLabel(refund.reason); refund.items = this.db.prepare('SELECT ri.*, si.name, si.price FROM refund_items ri JOIN sale_items si ON si.id=ri.sale_item_id WHERE refund_id=?').all(refund.id).map(item=>({...item,name:legacyLabel(item.name)})); }
    sale.refunded = sale.refunds.reduce((a,r) => a+r.total,0);
    return sale;
  }
  sales() {
    return this.db.prepare(`SELECT s.*, COALESCE((SELECT SUM(total) FROM refunds WHERE sale_id=s.id),0) refunded,
      (SELECT SUM(quantity) FROM sale_items WHERE sale_id=s.id) quantity FROM sales s ORDER BY created_at DESC LIMIT 500`).all();
  }
  checkout({items, cash, requestKey, discountPercent=100, paymentMethod='cash', paymentReference=''}) {
    check(integer(discountPercent,1,100),'Price rate must be a whole percentage from 1 to 100');
    check(['cash','wechat','alipay','card'].includes(paymentMethod),'Invalid payment method');
    check(typeof paymentReference==='string' && paymentReference.length<=80,'Invalid payment reference length');
    check(paymentMethod==='cash' || paymentReference.trim().length>=4,'Enter an external payment reference (at least 4 characters)');
    check(typeof requestKey==='string' && requestKey.length>=8 && requestKey.length<=100, 'A valid transaction key is required');
    const previous = this.db.prepare('SELECT id FROM sales WHERE request_key=?').get(requestKey);
    if (previous) return this.sale(previous.id);
    check(Array.isArray(items) && items.length>0 && items.length<=200, 'Add a product first');
    check(integer(cash, 1, 100000000), 'Invalid amount received');
    return this.transaction(() => {
      const seen=new Set();
      const lines=items.map(item => {
        check(item && typeof item.productId==='string' && !seen.has(item.productId), 'Invalid or duplicate product line'); seen.add(item.productId);
        check(integer(item.quantity,1,9999), 'Product quantity must be a positive integer');
        const product=this.db.prepare('SELECT * FROM products WHERE id=?').get(item.productId);
        check(product, 'Product not found'); check(product.stock>=item.quantity, `${product.name} insufficient stock`);
        const price=Math.round(product.price*discountPercent/100);
        check(price>0,'Discounted unit price cannot be less than 0.01');
        return {...product, originalPrice:product.price, price, quantity:item.quantity};
      });
      const total=lines.reduce((a,p)=>a+p.price*p.quantity,0);
      check(total<=100000000,'Order total exceeds the limit'); check(cash>=total,'Insufficient cash received');
      check(paymentMethod==='cash' || cash===total,'Non-cash payment must equal the amount due');
      const id=`SO${day().replaceAll('-','')}${randomUUID().slice(0,8).toUpperCase()}`;
      this.db.prepare('INSERT INTO sales (id,created_at,total,cash,change,request_key,payment_method,payment_reference,discount_percent) VALUES (?,?,?,?,?,?,?,?,?)').run(id,stamp(),total,cash,cash-total,requestKey,paymentMethod,paymentReference.trim(),discountPercent);
      for(const p of lines) {
        this.db.prepare('INSERT INTO sale_items (sale_id,product_id,name,barcode,unit,price,quantity,original_price) VALUES (?,?,?,?,?,?,?,?)').run(id,p.id,p.name,p.barcode,p.unit,p.price,p.quantity,p.originalPrice);
        this.db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(p.quantity,p.id);
        this.log(p.id,-p.quantity,`Sale ${id}`);
      }
      return this.sale(id);
    });
  }
  refund(saleId, {items, reason, requestKey}) {
    check(typeof requestKey==='string' && requestKey.length>=8 && requestKey.length<=100,'A valid refund key is required');
    const previous=this.db.prepare('SELECT id,sale_id FROM refunds WHERE request_key=?').get(requestKey);
    if(previous) { check(previous.sale_id===saleId,'Refund key does not match this order'); return this.sale(saleId); }
    check(typeof reason==='string' && reason.trim().length>0 && reason.length<=200,'Enter a return reason (up to 200 characters)');
    check(Array.isArray(items) && items.length>0 && items.length<=200,'Select items and quantities to return');
    return this.transaction(() => {
      this.sale(saleId);
      const seen=new Set();
      const lines=items.map(item => {
        check(item && integer(item.itemId,1) && !seen.has(item.itemId),'Invalid or duplicate return line'); seen.add(item.itemId);
        const line=this.db.prepare('SELECT * FROM sale_items WHERE id=? AND sale_id=?').get(item.itemId,saleId);
        check(line,'Return item does not belong to this order');
        check(integer(item.quantity,1) && item.quantity<=line.quantity-line.returned,`${line.name} return quantity exceeds the returnable quantity`);
        return {...line, refundQuantity:item.quantity};
      });
      const total=lines.reduce((a,p)=>a+p.price*p.refundQuantity,0);
      const id=`RF${day().replaceAll('-','')}${randomUUID().slice(0,8).toUpperCase()}`;
      this.db.prepare('INSERT INTO refunds VALUES (?,?,?,?,?,?)').run(id,saleId,stamp(),total,reason.trim(),requestKey);
      for(const p of lines) {
        this.db.prepare('INSERT INTO refund_items VALUES (?,?,?,?)').run(id,p.id,p.refundQuantity,p.refundQuantity*p.price);
        this.db.prepare('UPDATE sale_items SET returned=returned+? WHERE id=?').run(p.refundQuantity,p.id);
        this.db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(p.refundQuantity,p.product_id);
        this.log(p.product_id,p.refundQuantity,`Return ${id}`);
      }
      return this.sale(saleId);
    });
  }
  log(id,delta,reason) { this.db.prepare('INSERT INTO stock_logs (product_id,created_at,delta,reason) VALUES (?,?,?,?)').run(id,stamp(),delta,reason); }
  saveProduct(input,id) {
    check(input && typeof input.name==='string' && input.name.trim().length>0 && input.name.length<=60,'Product name must contain 1–60 characters');
    check(typeof input.barcode==='string' && /^[0-9]{8,18}$/.test(input.barcode),'Barcode must contain 8–18 digits');
    check(['Dairy & drinks','Fruit & vegetables','Snacks','Grocery & bakery','Household'].includes(input.category),'Select a valid category');
    check(integer(input.price,1,10000000),'Price must be positive and no more than CNY 100000');
    check(typeof input.unit==='string' && input.unit.trim().length>0 && input.unit.length<=8,'Enter a unit (up to 8 characters)');
    check(!this.db.prepare('SELECT id FROM products WHERE barcode=? AND id<>?').get(input.barcode,id||''),'This barcode already exists');
    if(id) {
      check(this.db.prepare('SELECT id FROM products WHERE id=?').get(id),'Product not found');
      this.db.prepare('UPDATE products SET name=?,barcode=?,category=?,price=?,unit=? WHERE id=?').run(input.name.trim(),input.barcode,input.category,input.price,input.unit.trim(),id);
    } else {
      check(integer(input.stock,0),'Opening stock must be a whole number from 0 to 1000000');
      id=randomUUID();
      this.transaction(()=>{
        this.db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)').run(id,input.barcode,input.name.trim(),input.category,input.price,input.stock,input.unit.trim(),'bag','green');
        this.log(id,input.stock,'Opening stock for new product');
      });
    }
    return this.db.prepare('SELECT * FROM products WHERE id=?').get(id);
  }
  adjust(id,{delta,reason}) {
    check(integer(Math.abs(delta),1) && Number.isSafeInteger(delta),'Stock change must be a non-zero integer');
    check(typeof reason==='string' && reason.trim().length>0 && reason.length<=200,'Enter an adjustment reason (up to 200 characters)');
    return this.transaction(()=>{
      const p=this.db.prepare('SELECT * FROM products WHERE id=?').get(id); check(p,'Product not found');
      check(p.stock+delta>=0 && p.stock+delta<=1000000,'Resulting stock must be between 0 and 1000000');
      this.db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(delta,id);
      this.log(id,delta,reason.trim());
      return this.db.prepare('SELECT * FROM products WHERE id=?').get(id);
    });
  }
  logs() { return this.db.prepare('SELECT l.*,p.name FROM stock_logs l JOIN products p ON p.id=l.product_id ORDER BY l.id DESC LIMIT 200').all().map(row=>({...row,reason:legacyLabel(row.reason).replace(/^销售 /,'Sale ').replace(/^退货 /,'Return ')})); }
  summary() {
    const today=day();
    const sales=this.db.prepare("SELECT COUNT(*) count,COALESCE(SUM(total),0) total FROM sales WHERE date(created_at,'+8 hours')=?").get(today);
    const refunds=this.db.prepare("SELECT COUNT(*) count,COALESCE(SUM(total),0) total FROM refunds WHERE date(created_at,'+8 hours')=?").get(today);
    return {today,sales,refunds,net:sales.total-refunds.total,lowStock:this.db.prepare('SELECT COUNT(*) n FROM products WHERE stock<=10').get().n};
  }
  close() { this.db.close(); }
}
