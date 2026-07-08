import json
import requests
from config import HOSTNAME, USERNAME, PASSWORD, VERIFY_SSL


def get_csrf_token():
    csrf_url = f"http://{HOSTNAME}/Windchill/servlet/odata/PTC/GetCSRFToken()"
    r = requests.get(csrf_url, auth=(USERNAME, PASSWORD), verify=VERIFY_SSL, timeout=30)
    r.raise_for_status()
    p = r.json()
    return p.get('NonceValue') or p.get('nonceValue') or p.get('value')


def fetch_uses(part_id: str):
    token = get_csrf_token()
    url = f"http://{HOSTNAME}/Windchill/servlet/odata/ProdMgmt/Parts('OR:wt.part.WTPart:{part_id}')/Uses"
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json', 'CSRF_NONCE': token}
    params = {'$expand': 'Uses'}
    r = requests.get(url, headers=headers, params=params, auth=(USERNAME, PASSWORD), verify=VERIFY_SSL, timeout=60)
    r.raise_for_status()
    return r.json()


if __name__ == '__main__':
    import sys
    pid = sys.argv[1] if len(sys.argv) > 1 else '576218'
    try:
        data = fetch_uses(pid)
    except Exception as e:
        print('Error fetching:', e)
        data = {'error': str(e)}
    with open('windchill_uses_raw.json','w',encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)
    print('Saved windchill_uses_raw.json')
