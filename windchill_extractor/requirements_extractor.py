import argparse,json,os,re,sys
from datetime import datetime,timezone
from urllib.parse import quote,urlparse
import requests
from config import HOSTNAME,USERNAME,PASSWORD,VERIFY_SSL
BASE=f"{HOSTNAME.rstrip('/')}/Windchill/servlet/odata/v5" if HOSTNAME.lower().startswith(("http://","https://")) else f"http://{HOSTNAME.rstrip('/')}/Windchill/servlet/odata/v5";TIMEOUT=int(os.getenv("WINDCHILL_TIMEOUT_SECONDS","90"));S=requests.Session();S.auth=(USERNAME,PASSWORD);S.verify=VERIFY_SSL;S.headers.update({"Accept":"application/json"})
def die(code,msg): print(json.dumps({"code":code,"message":msg}),file=sys.stderr);raise SystemExit(1)
def valid(v,p):
 if not re.fullmatch(re.escape(p)+r"\d+",v or""):die("INVALID_WINDCHILL_OID","Invalid Windchill object identifier.")
 return v
def get(path):
 try:r=S.get(path if path.startswith("http")else f"{BASE}/{path}",timeout=TIMEOUT)
 except requests.RequestException:die("WINDCHILL_REQUEST_FAILED","Windchill could not be reached.")
 if r.status_code in(401,403):die("WINDCHILL_AUTHENTICATION_FAILED","Windchill authentication or authorization failed.")
 if r.status_code==404:die("CONTENT_NOT_FOUND","Windchill content was not found.")
 if not r.ok:die("WINDCHILL_REQUEST_FAILED",f"Windchill returned HTTP {r.status_code}.")
 return r
def disp(v):return v.get("Display")if isinstance(v,dict)else v
def parts(kind,q):
 if kind=="part-oid":return[get(f"ProdMgmt/Parts('{valid(q,'OR:wt.part.WTPart:')}')").json()]
 field="Number"if kind=="part-number"else"Name";e=quote(q.replace("'","''"),safe="")
 return get(f"ProdMgmt/Parts?$filter={field}%20eq%20'{e}'&ptc.search.latestversion=true").json().get("value",[])
def ident(name):x=re.split(r"\s+-\s+",name or"",1);return x[0],x[1]if len(x)>1 else(name or"Requirement")
def category(title):
 t=re.sub(r"\s+Requirement$","",title,flags=re.I);return "Weight"if"Weight"in t else"Dimension"if"Dimension"in t else t
def fmeta(x,d,primary=False):
 cid=x.get("ID","");route="primary"if primary else"attachment";u=f"/api/windchill/content/{route}?documentId={quote(d,safe='')}"+(""if primary else f"&contentId={quote(cid,safe='')}")
 return{"id":cid,"fileName":x.get("FileName")or(x.get("Content")or{}).get("Label")or"download","fileSize":x.get("FileSize",0),"mimeType":x.get("MimeType")or"application/octet-stream","description":x.get("Description"),"downloadAvailable":True,"platformDownloadUrl":u}
def extract(kind,q):
 ps=parts(kind,q)
 if not ps:die("PART_NOT_FOUND",f"No latest Windchill part matched '{q}'.")
 if len(ps)>1:return{"status":"selection_required","code":"PART_NAME_AMBIGUOUS","query":q,"candidates":[{"id":p.get("ID"),"number":p.get("Number"),"name":p.get("Name"),"version":p.get("Version"),"view":p.get("View")}for p in ps]}
 p=ps[0];pid=valid(p["ID"],"OR:wt.part.WTPart:");warnings=[];specs=[]
 links=get(f"ProdMgmt/Parts('{pid}')/DescribedBy?$expand=DescribedBy").json().get("value",[])
 if not links:warnings.append("No Described By requirements specification was found.")
 for link in links:
  d=link.get("DescribedBy")
  if not d: warnings.append("A Described By document was inaccessible.");continue
  if"requirements specification"not in(d.get("Name")or"").lower():continue
  did=valid(d["ID"],"OR:wt.doc.WTDocument:");reqs=[]
  try:usage=get(f"DocMgmt/Documents('{did}')/DocUsageLinks?$expand=DocUses").json().get("value",[])
  except SystemExit:usage=[];warnings.append(f"Requirements for {d.get('Number')} were inaccessible.")
  for row in usage:
   c=row.get("DocUses")
   if not c:warnings.append(f"Specification {d.get('Number')} contains an inaccessible child.");continue
   rid,title=ident(c.get("Name"));reqs.append({"id":c.get("ID"),"number":c.get("Number"),"requirementId":rid,"title":title,"name":c.get("Name"),"revision":c.get("Revision"),"version":c.get("Version"),"state":disp(c.get("State")),"description":c.get("Description"),"category":category(title)})
  primary=None
  try:primary=fmeta(get(f"DocMgmt/Documents('{did}')/PrimaryContent").json(),did,True)
  except SystemExit:warnings.append(f"Specification {d.get('Number')} has no primary content.")
  try:atts=[fmeta(x,did)for x in get(f"DocMgmt/Documents('{did}')/Attachments").json().get("value",[])]
  except SystemExit:atts=[];warnings.append(f"Attachments for {d.get('Number')} were inaccessible.")
  specs.append({"id":did,"number":d.get("Number"),"name":d.get("Name"),"revision":d.get("Revision"),"version":d.get("Version"),"state":disp(d.get("State")),"description":d.get("Description"),"primaryContent":primary,"attachments":atts,"requirements":reqs})
 rs=[r for s in specs for r in s["requirements"]]
 return{"source":"windchill","query":{"type":kind,"value":q,"matchMode":"exact"},"part":{"id":pid,"number":p.get("Number"),"name":p.get("Name"),"revision":p.get("Revision"),"version":p.get("Version"),"latest":p.get("Latest",True),"state":disp(p.get("State")),"view":p.get("View"),"source":disp(p.get("Source")),"defaultUnit":disp(p.get("DefaultUnit")),"organization":p.get("OrganizationName"),"folder":p.get("FolderLocation"),"changeStatus":disp(p.get("ChangeStatus"))or(p.get("ChangeStatus")or{}).get("Tooltip"),"checkoutState":p.get("CheckoutState"),"customAttributes":{"chemical":p.get("Chemical"),"material":p.get("Material"),"dimension":p.get("Dimension"),"weight":p.get("Weight")}},"requirementSpecifications":specs,"summary":{"specificationCount":len(specs),"requirementCount":len(rs),"primaryContentCount":sum(bool(s["primaryContent"])for s in specs),"attachmentCount":sum(len(s["attachments"])for s in specs),"downloadableFileCount":sum(bool(s["primaryContent"])+len(s["attachments"])for s in specs),"categories":sorted({r["category"]for r in rs if r["category"]})},"warnings":warnings,"status":"partial-success"if warnings else"success","dataStatus":"poc-synthetic","extractedAt":datetime.now(timezone.utc).isoformat()}
def content(op,d,c,out):
 did=valid(d,"OR:wt.doc.WTDocument:")
 if op=="content-primary":m=get(f"DocMgmt/Documents('{did}')/PrimaryContent").json();b=S.get(f"{BASE}/DocMgmt/Documents('{did}')/PrimaryContent/$value",headers={"Accept":"*/*"},timeout=TIMEOUT).content
 else:
  valid(c,"OR:wt.content.ApplicationData:");items=get(f"DocMgmt/Documents('{did}')/Attachments").json().get("value",[]);m=next((x for x in items if x.get("ID")==c),None)
  if not m:die("CONTENT_NOT_FOUND","Attachment is not associated with the document.")
  u=(m.get("Content")or{}).get("URL")
  if not u or urlparse(u).hostname!=urlparse(BASE).hostname:die("WINDCHILL_CONTENT_DOWNLOAD_FAILED","Untrusted content location.")
  b=get(u).content
 open(out,"wb").write(b);return fmeta(m,did,op=="content-primary")
def main():
 a=argparse.ArgumentParser();a.add_argument("--operation",required=True);a.add_argument("--query-type");a.add_argument("--query");a.add_argument("--document-id");a.add_argument("--content-id");a.add_argument("--output",required=True);a.add_argument("--metadata-output");x=a.parse_args()
 if x.operation=="requirements":open(x.output,"w",encoding="utf8").write(json.dumps(extract(x.query_type or"part-name",x.query or""),indent=2))
 else:
  m=content(x.operation,x.document_id,x.content_id,x.output)
  if x.metadata_output:open(x.metadata_output,"w").write(json.dumps(m))
if __name__=="__main__":main()
