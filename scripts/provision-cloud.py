"""Provision/bind D1 after the Cloudflare token has Account > D1 > Edit.
Uses only configured environment credentials. Never prints secret values.
"""
import os,json,urllib.request,urllib.error,pathlib
account=os.environ['CLOUDFLARE_ACCOUNT_ID'].strip()
base='https://api.cloudflare.com/client/v4/accounts/'+account
headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'}
def api(path,method='GET',data=None):
    request=urllib.request.Request(base+path,headers=headers,method=method,data=json.dumps(data).encode() if data is not None else None)
    try:
        with urllib.request.urlopen(request,timeout=60) as response: result=json.load(response)
    except urllib.error.HTTPError as error:
        print('Cloudflare HTTP',error.code,'for',path.split('/')[1]);raise SystemExit(1)
    if not result.get('success'): print('Cloudflare operation failed');raise SystemExit(1)
    return result['result']
databases=api('/d1/database')
database=next((x for x in databases if x['name']=='dream-motors-studio'),None)
if not database: database=api('/d1/database','POST',{'name':'dream-motors-studio'})
id=database['uuid']
sql=(pathlib.Path(__file__).resolve().parents[1]/'server/schema.sql').read_text()
results=api('/d1/database/'+id+'/query','POST',{'sql':sql})
if any(not x.get('success') for x in results): print('Schema migration failed');raise SystemExit(1)
project=api('/pages/projects/dream-motors-studio')
bindings=project.get('deployment_configs',{}).get('production',{}).get('d1_databases',{}) or {}
bindings['DB']={'id':id}
api('/pages/projects/dream-motors-studio','PATCH',{'deployment_configs':{'production':{'d1_databases':bindings}}})
print('D1 schema applied and production DB binding saved. Redeploy Pages to activate it.')
