from playwright.sync_api import sync_playwright
from pathlib import Path
import json, time, sys

ROOT=Path(__file__).resolve().parent.parent
MAIN=str(ROOT/'Gadget%20page%20tool.js')
UPDATE=(ROOT/'Gadget%20page%20tool.update.js').read_text()
JQ='/usr/share/javascript/jquery/jquery.js'

DAY=86400000
now_ms=int(time.time()*1000)
def iso_ago(ms):
    import datetime
    return datetime.datetime.fromtimestamp((now_ms-ms)/1000, datetime.timezone.utc).isoformat().replace('+00:00','Z')

def rev(revid, size=None, days=None, user=None, comment=None):
    d={'revid':revid}
    if size is not None: d['size']=size
    if days is not None: d['timestamp']=iso_ago(days*DAY)
    if user is not None: d['user']=user
    if comment is not None: d['comment']=comment
    return d

def page_data(title, revisions, cont=None):
    d={'query':{'pageids':['1'],'pages':{'1':{'title':title,'revisions':revisions}}}}
    if cont: d['continue']=cont
    return d

def boot(browser, spec):
    page=browser.new_page(viewport={'width':spec.get('width',1280),'height':900})
    page.set_content('<!doctype html><html lang="he" dir="rtl"><head></head><body><div id="content"><div class="mw-indicators"></div><h1>מקומי</h1><div id="bodyContent"><div id="mw-content-text"><p>תוכן</p></div></div></div></body></html>')
    page.add_script_tag(path=JQ)
    cfg=json.dumps(spec, ensure_ascii=False)
    setup=f"""
    window.__spec={cfg}; window.__calls=[]; window.__scripts=[]; window.__counts={{local:0,wp:0,compare:0}};
    window.__UPDATE_CODE={json.dumps(UPDATE)};
    function take(kind, params, url) {{
      __counts[kind]++; __calls.push({{kind:kind,url:url||null,params:JSON.parse(JSON.stringify(params))}});
      var seq=__spec[kind+'Seq'] || null; var out=seq ? seq[Math.min(__counts[kind]-1,seq.length-1)] : null;
      if (!out) {{
        if (kind==='local') out={{query:{{pageids:['9'],pages:{{'9':{{title:'מקומי',revisions:[{{revid:7,timestamp:new Date(Date.now()-90*86400000).toISOString(),user:'פלוני',comment:'עדכון מוויקיפדיה גרסה 100'}}]}}}}}}}};
        if (kind==='wp') out={{query:{{pageids:['1'],pages:{{'1':{{title:'בסיס',revisions:[{{revid:300,size:42180}},{{revid:100,size:40940}}]}}}}}}}};
        if (kind==='compare') out={{compare:{{'*':'<tr><td class="diff-marker"></td><td class="diff-deletedline"><div>ישן</div></td><td class="diff-marker"></td><td class="diff-addedline"><div>חדש</div></td></tr>'}}}};
      }}
      if (out && out.reject) {{ var e=new Error(out.message||'השרת לא ענה בזמן.'); e.netError=true; e.kind=out.kind||'timeout'; e.code=out.code||null; e.transient=!!out.transient; return Promise.reject(e); }}
      return Promise.resolve(out);
    }}
    function firstPage(data) {{ var q=data&&data.query;if(!q||!q.pages)return null;var id=(q.pageids&&q.pageids[0])||Object.keys(q.pages)[0];return id?q.pages[id]:null; }}
    function structureError(context) {{ var e=new Error('התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.'); e.netError=true;e.kind='structure';e.transient=false;e.context=context;return e; }}
    window.mw={{
      config:{{get:function(k){{return ({{wgCategories:[],wgNamespaceNumber:0,wgPageName:'מקומי',wgAction:'view',wgUserGroups:(__spec.userGroups===undefined?['wikiupdate','aspaklaryaEditor']:__spec.userGroups),wgIsMainPage:false}})[k];}}}},
      user:{{options:{{get:function(k){{return k==='userjs-import-source'&&__spec.direct?'direct':null;}}}}}},
      util:{{addCSS:function(t){{var s=document.createElement('style');s.textContent=t;document.head.appendChild(s);}},getUrl:function(t,p){{return '/w/index.php?title='+encodeURIComponent(t);}}}},
      loader:{{using:function(){{return Promise.resolve();}},getScript:function(url){{__scripts.push(url); if(url.indexOf('update.js')!==-1){{eval(__UPDATE_CODE);return Promise.resolve();}}return Promise.reject(new Error('unexpected '+url));}}}}
    }};
    window.HMK_PAGE_TOOL_CORE_FACTORY=function(){{return {{
      run:function(){{return Promise.resolve({{localStateMatched:false,result:{{status:'found',title:'בסיס',page:{{revisions:[{{size:42180,revid:(__spec.currentRevid===undefined?300:__spec.currentRevid)}}],langlinks:[]}}}}}});}},
      getCurrentLocalPage:function(){{return {{size:42000}};}},
      getOwnFields:function(){{return {{'דף':'בסיס','גרסה':(__spec.imported===undefined?'100':__spec.imported),'פריט':null}};}},
      firstPage:firstPage,structureError:structureError,
      localQuery:function(params){{return take('local',params,'/w/api.php');}},
      wpQuery:function(params){{return take(params.action==='compare'?'compare':'wp',params,'core-wp');}},
      netGet:function(url,params){{return take(params.action==='compare'?'compare':'wp',params,url);}}
    }};}};
    """
    page.evaluate(setup)
    page.add_script_tag(path=MAIN)
    page.wait_for_timeout(50)
    return page

def click(page, sel):
    page.locator(sel).first.click()
    page.wait_for_timeout(30)

def lines(page):
    return page.locator('#hmk-update-panel .hmk-update-line:visible').all_inner_texts()

def norm(s): return ' '.join(s.split())
def expect(cond,msg):
    if not cond: raise AssertionError(msg)

def run():
  results=[]
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    def test(name, fn):
      try:
        fn(browser); results.append(('PASS',name,'')); print('PASS',name)
      except Exception as e:
        results.append(('FAIL',name,str(e))); print('FAIL',name,'\n   ',e)

    def t1(b):
      spec={'localSeq':[page_data('מקומי',[rev(12,days=1,user='חדש',comment='עדכון מוויקיפדיה גרסה 250'),rev(10,days=10,user='תואם',comment='עדכון מוויקיפדיה גרסה 100')])]}
      pg=boot(b,spec); click(pg,'.hmk-update-toggle'); ls=[norm(x) for x in lines(pg)]
      expect(ls[0]=='עודכן לפני 10 ימים ע"י תואם',ls)
      expect(ls[1]=='העדכון האחרון מציין גרסה שונה ממספר הגרסה בתבנית המיון.',ls)
      calls=pg.evaluate('__calls'); wp=[x for x in calls if x['kind']=='wp'][0]
      expect(wp['url']=='/import/get_wik1i.php',wp); expect(wp['params']['rvlimit']==500,wp)
      click(pg,'.hmk-update-action'); calls=pg.evaluate('__calls'); cmp=[x for x in calls if x['kind']=='compare'][0]
      expect(cmp['url']=='https://import.hamichlol.org.il/',cmp)
      expect(pg.locator('#hmk-update-panel table.diff').count()==1,'diff missing')
      expect(pg.locator('#hmk-update-panel table.diff colgroup col').count()==4,'colgroup wrong')
      expect(norm(pg.locator('.hmk-update-action').inner_text())=='הסתר הבדלים','listener lost')
      pg.close()
    test('התאמת גרסה + mismatch + endpoints ברירת מחדל + diff עובד',t1)

    def t2(b):
      pg=boot(b,{'localSeq':[page_data('מקומי',[rev(12,days=1,user='חדש',comment='עדכון מוויקיפדיה גרסה 250')])]}); click(pg,'.hmk-update-toggle'); ls=[norm(x) for x in lines(pg)]
      expect(ls[0]=='לא נמצא בהיסטוריית הגרסאות עדכון לגרסה הנוכחית.',ls); expect(ls[1]=='העדכון האחרון מציין גרסה שונה ממספר הגרסה בתבנית המיון.',ls); pg.close()
    test('עדכון ממוספר ללא התאמה מציג אין מידע + mismatch',t2)

    def t3(b):
      pg=boot(b,{'localSeq':[page_data('מקומי',[rev(8,days=400,user='פלוני',comment='יבוא מויקיפדיה העברית')])]}); click(pg,'.hmk-update-toggle'); ls=[norm(x) for x in lines(pg)]
      expect(ls[0].startswith('יובא לפני שנה ע"י פלוני · לא עודכן מאז'),ls); pg.close()
    test('ייבוא משמש fallback רק כשאין עדכון ממוספר',t3)

    def t4(b):
      pg=boot(b,{'direct':True}); click(pg,'.hmk-update-toggle'); calls=pg.evaluate('__calls'); wp=[x for x in calls if x['kind']=='wp'][0]
      expect(wp['url']=='https://he.wikipedia.org/w/api.php',wp); expect(wp['params'].get('origin')=='*',wp); click(pg,'.hmk-update-action'); cmp=[x for x in pg.evaluate('__calls') if x['kind']=='compare'][0]; expect(cmp['url']=='https://he.wikipedia.org/w/api.php',cmp); pg.close()
    test('מצב direct משתמש ב-API של ויקיפדיה לשתי הבקשות',t4)

    def t5(b):
      pg=boot(b,{'wpSeq':[{'reject':True,'transient':True,'kind':'timeout'},page_data('בסיס',[rev(300,size=100),rev(100,size=100)])]}); click(pg,'.hmk-update-toggle'); expect(pg.locator('.hmk-update-retry').count()==1,'retry missing'); expect(any(norm(x).startswith('השינויים בוויקיפדיה: לא נבדקו (השרת לא ענה בזמן.)') for x in lines(pg)),lines(pg)); click(pg,'.hmk-update-retry'); expect('בוויקיפדיה מאז גרסת הייבוא: עריכה אחת · ללא שינוי בגודל' in [norm(x) for x in lines(pg)],lines(pg)); pg.close()
    test('retry מוצג רק לכשל רגעי ומצליח',t5)

    def t6(b):
      pg=boot(b,{'wpSeq':[{'reject':True,'transient':False,'kind':'structure'}]}); click(pg,'.hmk-update-toggle'); expect(pg.locator('.hmk-update-retry').count()==0,'retry on permanent'); pg.close()
    test('כשל קבוע אינו מציע retry',t6)

    def t6b(b):
      pg=boot(b,{'wpSeq':[{'reject':True,'transient':False,'kind':'structure','message':'התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.'}]}); click(pg,'.hmk-update-toggle'); ls=[norm(x) for x in lines(pg)]
      expect('השינויים בוויקיפדיה: לא נבדקו (התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.)' in ls,ls); expect(pg.locator('.hmk-update-retry').count()==0,'retry on permanent'); pg.close()
    test('כשל קבוע מציג את הודעת הליבה עצמה',t6b)

    def t7(b):
      pg=boot(b,{'compareSeq':[{'reject':True,'transient':True,'kind':'timeout'},{'compare':{'*':''}}]}); click(pg,'.hmk-update-toggle'); click(pg,'.hmk-update-action'); expect('הבדלים: לא נבדקו (השרת לא ענה בזמן.)' in norm(pg.locator('.hmk-update-actions').inner_text()),pg.locator('.hmk-update-actions').inner_text()); click(pg,'.hmk-update-action'); expect(norm(pg.locator('.hmk-update-diff').inner_text())=='אין הבדלים בתוכן.','diff retry failed'); pg.close()
    test('כשל רגעי ב-diff שומר listener ומאפשר retry',t7)

    def t7b(b):
      pg=boot(b,{'compareSeq':[{'reject':True,'transient':False,'kind':'structure','message':'התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.'}]}); click(pg,'.hmk-update-toggle'); click(pg,'.hmk-update-action');
      btn=pg.locator('.hmk-update-action'); expect(not btn.is_visible(),'diff button should be hidden'); expect(norm(btn.inner_text())=='הצג הבדלים',btn.inner_text());
      expect('הבדלים: לא נבדקו (התשובה מהשרת התקבלה, אך חסר בה מידע צפוי.)' in norm(pg.locator('.hmk-update-actions').inner_text()),pg.locator('.hmk-update-actions').inner_text()); pg.close()
    test('כשל קבוע ב-diff מאפס תווית לפני הסתרה ומציג הודעת ליבה',t7b)

    def t_badid(b):
      pg=boot(b,{'wpSeq':[{'reject':True,'transient':False,'kind':'api','code':'badid_rvendid'}]}); click(pg,'.hmk-update-toggle'); ls=[norm(x) for x in lines(pg)]; expect('גרסת הייבוא אינה נמצאת בהיסטוריית הדף בוויקיפדיה.' in ls,ls); expect(pg.locator('.hmk-update-retry').count()==0,'retry on badid'); pg.close()
    test('badid_rvendid מוצג כממצא קבוע ספציפי',t_badid)

    def t8(b):
      first=[rev(i,size=1000+i) for i in range(700,200,-1)]  # 500 revisions
      second=[rev(200,size=1200),rev(100,size=900)]
      pg=boot(b,{'wpSeq':[page_data('בסיס',first,{'rvcontinue':'200|200','continue':'||'}),page_data('בסיס',second)]}); click(pg,'.hmk-update-toggle'); calls=[x for x in pg.evaluate('__calls') if x['kind']=='wp']; expect(len(calls)==2,calls); expect(calls[1]['params'].get('continue')=='||',calls[1]); expect(calls[1]['params'].get('rvcontinue')=='200|200',calls[1]); expect('501 עריכות' in norm(pg.locator('#hmk-update-panel').inner_text()),pg.locator('#hmk-update-panel').inner_text()); pg.close()
    test('pagination מלא מעל 500 עם אובייקט continuation מלא',t8)

    def t9(b):
      pg=boot(b,{'wpSeq':[page_data('בסיס',[rev(310,size=42300),rev(300,size=42180),rev(100,size=40940)])]}); click(pg,'.hmk-update-toggle'); click(pg,'.hmk-update-action'); cmp=[x for x in pg.evaluate('__calls') if x['kind']=='compare'][0]; expect(str(cmp['params']['torev'])=='310',cmp); pg.close()
    test('ה-diff מסתיים בגרסה שנמדדה ולא בגרסה הישנה מהטעינה',t9)

    def t10(b):
      pg=boot(b,{'width':375}); click(pg,'.hmk-update-toggle'); expect(pg.locator('.mw-indicators #hmk-update-panel').count()==0,'panel nested in indicator'); box=pg.locator('#hmk-update-panel').bounding_box(); expect(box and box['width']>300,box); pg.close()
    test('מסך צר: החלונית נפרדת ואינה נדחסת ליד הטריגר',t10)

    def t11(b):
      pg=boot(b,{'currentRevid':100}); expect(pg.locator('.hmk-update-toggle').count()==0,'trigger exists'); expect(pg.evaluate('__calls.length')==0,'network calls'); pg.close()
    test('אין שינוי: אין טריגר ואין קריאות',t11)

    def t12(b):
      pg=boot(b,{'userGroups':[]}); click(pg,'.hmk-update-toggle')
      expect(any(norm(x).startswith('בוויקיפדיה מאז גרסת הייבוא:') for x in lines(pg)),lines(pg))
      expect(pg.locator('.hmk-update-action').count()==0,'diff button visible without groups')
      expect(len([x for x in pg.evaluate('__calls') if x['kind']=='compare'])==0,'compare sent without groups')
      pg.close()
    test('ללא קבוצות הרשאה: הנתונים מוצגים בלי כפתור ובלי compare',t12)

    def t13(b):
      for groups in [['wikiupdate'],['aspaklaryaEditor']]:
        pg=boot(b,{'userGroups':groups}); click(pg,'.hmk-update-toggle')
        expect(pg.locator('.hmk-update-action').count()==0,'diff button visible for '+','.join(groups))
        expect(len([x for x in pg.evaluate('__calls') if x['kind']=='compare'])==0,'compare sent for '+','.join(groups))
        pg.close()
    test('קבוצה אחת בלבד אינה מספיקה להצגת ההבדלים',t13)

    browser.close()
  fail=[r for r in results if r[0]=='FAIL']
  print(f"\nסה״כ: {len(results)-len(fail)}/{len(results)} עברו")
  return 1 if fail else 0

if __name__=='__main__': sys.exit(run())
