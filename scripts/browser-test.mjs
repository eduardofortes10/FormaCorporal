import {chromium} from 'playwright';
import {createServer} from 'node:net';
import {createApp} from '../server/app.mjs';
import assert from 'node:assert/strict';
const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const origin=`http://127.0.0.1:${port}`;
const {server}=await createApp({databasePath:':memory:',origin});await new Promise(r=>server.listen(port,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1366,height:900}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  async function account(email,signup=true){if(signup)await page.click('#auth-toggle');await page.fill('#auth-form [name=email]',email);await page.fill('#auth-form [name=password]','SenhaDoTeste12345!');await page.click('#auth-submit');await page.waitForFunction(()=>!document.body.classList.contains('signed-out'));}
  await page.goto(origin);await account('first@example.com');
  await page.click('#add');await page.fill('#form [name=date]','2026-01-01');await page.click('#wizard-all');await page.fill('#form [name=forearmRight]','30');await page.fill('#form [name=notes]','Registro privado A');await page.click('#form [type=submit]');await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.match(await page.locator('#records').innerText(),/Registro privado A/);
  await page.reload();await page.waitForFunction(()=>!document.body.classList.contains('signed-out'));assert.match(await page.locator('#records').innerText(),/30 cm/);
  // A second browser context is a distinct device, with a distinct session.
  const device=await browser.newContext();const other=await device.newPage();await other.goto(origin);await other.fill('#auth-form [name=email]','first@example.com');await other.fill('#auth-form [name=password]','SenhaDoTeste12345!');await other.click('#auth-submit');await other.waitForFunction(()=>!document.body.classList.contains('signed-out'));assert.match(await other.locator('#records').innerText(),/Registro privado A/);await device.close();
  await page.click('#account-logout');await page.waitForSelector('body.signed-out');assert.equal(await page.locator('main').isVisible(),false);
  // Registration mode survives the preceding form; toggle to login and back as needed.
  if((await page.locator('#auth-submit').innerText())==='Entrar')await page.click('#auth-toggle');await page.fill('#auth-form [name=email]','second@example.com');await page.fill('#auth-form [name=password]','SenhaDoTeste12345!');await page.click('#auth-submit');await page.waitForFunction(()=>!document.body.classList.contains('signed-out'));assert.doesNotMatch(await page.locator('#records').innerText(),/Registro privado A/);
  // Import legacy local data only after explicit user confirmation.
  await page.evaluate(()=>localStorage.setItem('forma.records.v1',JSON.stringify([{id:'legacy',date:'2025-01-01',weight:70,notes:'Registro antigo'}])));await page.reload();await page.waitForSelector('#migrate-local');await page.click('#migrate-local');await page.waitForFunction(()=>document.querySelector('#records').textContent.includes('Registro antigo'));assert.ok(await page.evaluate(()=>localStorage.getItem('forma.records.v1')));
  // A stale tab must receive a conflict and retain the open form.
  const stale=await context.newPage();await stale.goto(origin);await stale.waitForFunction(()=>!document.body.classList.contains('signed-out'));await page.click('#add');await page.fill('#form [name=date]','2026-02-01');await page.click('#form [type=submit]');await page.waitForFunction(()=>!document.querySelector('#dialog').open);await stale.click('#add');await stale.fill('#form [name=date]','2026-03-01');await stale.click('#form [type=submit]');await stale.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('Outra aba'));assert.equal(await stale.locator('#dialog').isVisible(),true);await stale.close();
  // A network failure must not close the form or claim that a record was saved.
  await page.click('#add');await page.fill('#form [name=date]','2026-04-01');await page.route('**/api/assessments',route=>route.abort());await page.click('#form [type=submit]');await page.waitForFunction(()=>document.querySelector('#form-error').textContent.includes('conectar'));assert.equal(await page.locator('#dialog').isVisible(),true);await page.unroute('**/api/assessments');await page.click('#close');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('Browser OK: cadastro, login, dados privados, segundo dispositivo, migração, conflito entre abas, falha de rede e mobile.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
