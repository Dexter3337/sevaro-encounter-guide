from pathlib import Path
import re, html, shutil
root=Path(__file__).resolve().parents[1]
out=root/'public'; out.mkdir(exist_ok=True)
def inline(s):
 s=html.escape(s)
 s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
 s=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
 return re.sub(r'\[([^]]+)\]\(([^)]+)\)',r'<span>\1</span>',s)
def flow(items):
 return '<div class="flow">'+''.join('<div class="node"><b>'+str(i+1).zfill(2)+'</b>'+inline(s)+'</div>'+('<span class="arrow" aria-hidden="true">→</span>' if i<len(items)-1 else '') for i,s in enumerate(items))+'</div>'
flows=[['Open / restore','Pin hospital guide','Caselog + cited guidance','Review requirements','Mock completion'],['Clinician action','Validate event + revision','Evaluate pinned sources + local time','Render cards + citations','Audit + latency'],['Ask a question','Match field or clarify','Current hospital only','Interpret time + quality','Cited answer / absence'],['Request completion','Available, fresh source?','Explicit required field Yes?','Fix blocker or review uncertainty','Mock completion'],['JSON / CSV','Validate + preview','Activate version','Case stays pinned','Explicit Refresh']]
md=(root/'docs/APP_WORKFLOW.md').read_text(encoding='utf-8')
parts=re.split(r'(```mermaid\n[\s\S]*?```)',md); rendered=[]; index=0
for part in parts:
 if part.startswith('```mermaid'):
  rendered.append(flow(flows[index])); index+=1; continue
 lines=part.splitlines(); i=0
 while i<len(lines):
  line=lines[i]
  if line.startswith('|'):
   rows=[]
   while i<len(lines) and lines[i].startswith('|'):
    cells=[x.strip() for x in lines[i].strip('|').split('|')]
    if not all(re.fullmatch(r'[- :]+',x) for x in cells): rows.append(cells)
    i+=1
   rendered.append('<div class="table-wrap"><table>'+''.join('<tr>'+''.join(('<th>' if n==0 else '<td>')+inline(c)+('</th>' if n==0 else '</td>') for c in row)+'</tr>' for n,row in enumerate(rows))+'</table></div>'); continue
  m=re.match(r'^(#{1,3}) (.*)',line)
  if m:
   level=len(m[1]); slug=re.sub(r'[^a-z0-9]+','-',m[2].lower()).strip('-')
   rendered.append(f'<h{level} id="{slug}">{inline(m[2])}</h{level}>')
  elif line: rendered.append('<p>'+inline(line)+'</p>')
  i+=1
css='''*{box-sizing:border-box}body{margin:0;background:#f2f4f4;color:#162f36;font:17px/1.6 system-ui,sans-serif}header{background:#103b43;color:white;padding:24px 5vw;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}a{color:inherit}main{max-width:1160px;margin:auto;padding:36px 24px}h1{font-size:44px;line-height:1.15;max-width:850px}h2{margin-top:58px;font-size:28px;border-top:1px solid #ccd9da;padding-top:28px}h3{margin-top:30px}p{max-width:1000px}.table-wrap{overflow:auto;background:white;border:1px solid #ccd9da;border-radius:12px}table{border-collapse:collapse;width:100%;font-size:15px}th,td{text-align:left;vertical-align:top;padding:14px;border-bottom:1px solid #dbe4e5}th{background:#e5eeee}code{background:#e5eeee;padding:2px 5px;border-radius:4px}.flow{display:flex;align-items:center;gap:10px;padding:25px 0;overflow:auto}.node{min-width:150px;flex:1;background:#103b43;color:white;border-radius:12px;padding:20px;font-size:15px;line-height:1.35}.node b{display:block;color:#71dfc6;font-size:12px;margin-bottom:14px}.arrow{color:#0d776e;font-size:25px}.download{display:flex;gap:24px;margin-top:20px}@media(max-width:650px){h1{font-size:32px}.flow{flex-direction:column}.node{width:100%}.arrow{transform:rotate(90deg)}header{font-size:14px}}@media print{header{background:white;color:black}main{padding:0}h2{break-after:avoid}.node{background:#eee;color:black}.table-wrap{overflow:visible}.download{display:none}}'''
(out/'workflow.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Encounter Guide · Detailed workflow</title><style>'+css+'</style><header><strong>ENCOUNTER GUIDE / WORKFLOW</strong><nav><a href="/">Demo</a> · <a href="/presentation.html">Mentor presentation</a> · <a href="https://github.com/Dexter3337/sevaro-encounter-guide">GitHub</a></nav></header><main><div class="download"><a href="/APP_WORKFLOW.md" download>Download written specification</a><a href="/TEST_RESULTS.md" download>Download test evidence</a></div>'+''.join(rendered)+'</main></html>',encoding='utf-8')
for src,dst in [('docs/APP_WORKFLOW.md','APP_WORKFLOW.md'),('reports/TEST_RESULTS.md','TEST_RESULTS.md'),('reports/desktop-n2.png','desktop-n2.png'),('reports/mobile-n2.png','mobile-n2.png'),('data/holdout/unfamiliar-hospitals.json','unfamiliar-hospitals.json'),('data/holdout/mapped-import.csv','mapped-import.csv')]: shutil.copyfile(root/src,out/dst)
print('Generated workflow and copied synthetic demo/evidence assets')
