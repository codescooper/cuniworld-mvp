"""Run on the CuniWorld VPS: real API isolation checks using disposable QA users.

Reads server configuration locally; never prints credentials or private payloads.
Only the synthetic users created by this run are removed in cleanup.
"""
import base64
import json
import pathlib
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = pathlib.Path('/opt/awema-cuniworld/backend')
ENV = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines()
           if line and not line.startswith('#') and '=' in line)


def address(container, port):
    data = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]
    return 'http://' + data['NetworkSettings']['Networks']['cuniworld-backend']['IPAddress'] + ':' + str(port)


AUTH = address('cuniworld-auth', 9999)
ADMIN_AUTH = AUTH
REST = address('cuniworld-rest', 3000)
STORAGE = address('cuniworld-storage', 5000)
if '--public' in sys.argv:
    AUTH = ENV['SUPABASE_PUBLIC_URL'] + '/auth/v1'
    REST = ENV['SUPABASE_PUBLIC_URL'] + '/rest/v1'
    STORAGE = ENV['SUPABASE_PUBLIC_URL'] + '/storage/v1'
results = []
users = []


def call(base, path, method='GET', data=None, token=None, raw=None, extra=None):
    headers = {'Content-Type': 'application/json', 'apikey': ENV['ANON_KEY']}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    headers.update(extra or {})
    payload = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(base + path, data=payload, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read()
            try:
                body = json.loads(body)
            except (ValueError, UnicodeDecodeError):
                pass
            return response.status, body
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def check(name, ok):
    results.append({'check': name, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(name)


try:
    subprocess.run(['docker', 'exec', 'cuniworld-db', 'psql', '-U', 'postgres', '-d', 'postgres',
                    '-c', "NOTIFY pgrst, 'reload schema';"], check=True, stdout=subprocess.DEVNULL)
    tokens = []
    for suffix in ['a', 'b']:
        email = 'cuni-qa-' + secrets.token_hex(8) + suffix + '@example.invalid'
        password = secrets.token_urlsafe(30)
        status, account = call(ADMIN_AUTH, '/admin/users', 'POST',
                               {'email': email, 'password': password, 'email_confirm': True}, ENV['SERVICE_ROLE_KEY'])
        check('create disposable account ' + suffix, status in (200, 201))
        users.append(account['id'])
        status, session = call(AUTH, '/token?grant_type=password', 'POST', {'email': email, 'password': password})
        check('password login ' + suffix, status == 200 and bool(session.get('access_token')))
        tokens.append(session['access_token'])
    a, b = tokens
    status, action = call(ADMIN_AUTH, '/admin/generate_link', 'POST',
                          {'type': 'recovery', 'email': email,
                           'redirect_to': 'https://cuniworld.awema.cloud/'}, ENV['SERVICE_ROLE_KEY'])
    check('generate email action without sending mail', status == 200)
    link = urllib.parse.urlparse(action['action_link'])
    check('email verification path targets VPS gateway',
          link.scheme == 'https' and link.netloc == 'cuniworld.awema.cloud'
          and link.path == '/backend/auth/v1/verify')
    if '--public' in sys.argv:
        status, _ = call(AUTH, '/admin/users')
        check('public auth administration route is blocked', status == 404)
    status, farm = call(REST, '/rpc/create_farm_with_owner', 'POST', {'farm_name': 'QA CuniWorld isolation'}, a)
    check('create farm with owner through RPC', status == 200 and bool(farm.get('id')))
    fid = farm['id']
    rabbit = 'qa-' + uuid.uuid4().hex
    status, _ = call(REST, '/rabbits', 'POST', {'id': rabbit, 'farm_id': fid, 'data': {'name': 'QA private', 'forSale': False}}, a)
    check('owner can save private rabbit', status == 201)
    for label, token in [('anonymous', None), ('other account', b)]:
        for table in ['farms', 'farm_members', 'rabbits', 'profiles', 'orders', 'transactions']:
            status, rows = call(REST, '/' + table + '?select=*', token=token)
            check(label + ' cannot read private ' + table, status == 200 and rows == [])
    status, _ = call(REST, '/rabbits', 'POST', {'id': 'foreign-' + rabbit, 'farm_id': fid, 'data': {}}, b)
    check('other account cannot insert into private farm', status in (401, 403))
    status, _ = call(REST, '/rabbits?id=eq.' + rabbit, 'PATCH', {'data': {'name': 'forbidden'}}, b,
                     extra={'Prefer': 'return=representation'})
    status, rows = call(REST, '/rabbits?id=eq.' + rabbit, token=a)
    check('other account cannot modify private rabbit', status == 200 and rows[0]['data']['name'] == 'QA private')
    status, _ = call(REST, '/farm_members', 'POST', {'farm_id': fid, 'user_id': users[1], 'role': 'owner'}, b)
    check('invitation cannot escalate to owner', status in (401, 403))
    status, _ = call(REST, '/rpc/remove_farm_member', 'POST', {'p_farm_id': fid, 'p_user_id': users[0]})
    check('anonymous cannot invoke member-removal RPC', status in (401, 403, 404))
    status, _ = call(REST, '/rpc/get_farm_members', 'POST', {'p_farm_id': fid}, b)
    check('nonmember cannot read farm member identities', status >= 400)
    photo_path = 'photos/farms/' + fid + '/rabbits/' + rabbit + '/qa.png'
    png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
    status, _ = call(STORAGE, '/object/' + photo_path, 'POST', token=a, raw=png, extra={'Content-Type': 'image/png'})
    check('owner can upload private photo', status in (200, 201))
    for label, token in [('anonymous', None), ('other account', b)]:
        status, _ = call(STORAGE, '/object/sign/' + photo_path, 'POST', {'expiresIn': 60}, token)
        check(label + ' cannot sign private photo', status >= 400)
    status, _ = call(STORAGE, '/object/sign/' + photo_path, 'POST', {'expiresIn': 60}, a)
    check('owner can sign private photo', status == 200)
    status, _ = call(STORAGE, '/object/photos', 'DELETE',
                     {'prefixes': [photo_path.removeprefix('photos/')]}, a)
    check('remove own synthetic test photo', status == 200)
    status, _ = call(REST, '/farm_members', 'POST', {'farm_id': fid, 'user_id': users[1], 'role': 'member'}, b)
    check('existing invitation-by-farm-id flow still works as member', status == 201)
finally:
    for uid in users:
        status, _ = call(ADMIN_AUTH, '/admin/users/' + uid, 'DELETE', token=ENV['SERVICE_ROLE_KEY'])
        results.append({'check': 'cleanup own disposable user', 'passed': status == 200})
    (ROOT / 'verification.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))
