import os
import httpx

class Database:
    def __init__(self, key=None):
        self.url = os.environ.get('SUPABASE_URL', '').rstrip('/')
        self.key = key or os.environ.get('SUPABASE_PUBLISHABLE_KEY')
        if not self.url or not self.key:
            raise RuntimeError('Supabase URL and key are required')
        headers = {'apikey': self.key}
        if self.key.startswith('eyJ'):
            headers['Authorization'] = 'Bearer ' + self.key
        self.client = httpx.Client(base_url=self.url+'/rest/v1/', headers=headers, timeout=12)
    def __enter__(self):
        return self
    def __exit__(self, *_):
        self.client.close()
    def request(self, method, path, *, params=None, data=None, prefer=None):
        response = self.client.request(method, path, params=params, json=data, headers={'Prefer':prefer} if prefer else None)
        response.raise_for_status()
        return response.json() if response.content else None

def privileged_database():
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not key:
        raise RuntimeError('SUPABASE_SERVICE_ROLE_KEY must be configured for worker operations')
    return Database(key)
