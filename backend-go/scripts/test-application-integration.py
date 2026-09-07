#!/usr/bin/env python3
"""Run Go + production Next.js + Nginx against disposable PostgreSQL/Redis.

Build sneepcut-go:migration-check and sneepcut-frontend:go-migration-check first.
Requires local FFmpeg for the synthetic playback/range fixture.
Uses synthetic accounts, an isolated Docker network/media volume, and no .env.
--keep retains the fixture for browser QA; --stop STATE removes only that fixture.
"""
import argparse
import http.cookiejar
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'sneepcut-go-browser-test-'

def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)

def docker(*args, **kwargs):
    return run('docker', *args, **kwargs)

def stop(state):
    name = state['name']
    assert name.startswith(PREFIX) and name[len(PREFIX):].isalnum()
    for suffix in ('nginx', 'frontend', 'api', 'redis', 'postgres'):
        subprocess.run(['docker', 'rm', '-f', name+'-'+suffix], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker','volume','rm',name+'-media'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['docker','network','rm',name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('Disposable browser fixture removed; persistent services/data were not used.')

def start():
    name = PREFIX+uuid.uuid4().hex[:12]
    directory = Path(tempfile.mkdtemp(prefix=PREFIX))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    state = {'name':name, 'base':base, 'directory':str(directory), 'email':'browser-fixture@example.invalid', 'password':'BrowserFixturePass42!'}
    state_path = directory/'state.json'
    state_path.write_text(json.dumps(state,indent=2)+'\n')
    try:
        docker('network','create',name,stdout=subprocess.DEVNULL)
        docker('volume','create',name+'-media',stdout=subprocess.DEVNULL)
        docker('run','--rm','-d','--name',name+'-postgres','--network',name,'--network-alias','postgres',
               '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_USER=test','-e','POSTGRES_PASSWORD=local-test-only',
               '-e','POSTGRES_DB=sneepcut_integration_test','postgres:16-alpine',stdout=subprocess.DEVNULL)
        docker('run','--rm','-d','--name',name+'-redis','--network',name,'--network-alias','redis',
               'redis:7-alpine','redis-server','--save','','--appendonly','no',stdout=subprocess.DEVNULL)
        for _ in range(100):
            ready=subprocess.run(['docker','exec',name+'-postgres','pg_isready','-U','test','-d','sneepcut_integration_test'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if ready.returncode==0: break
            time.sleep(.2)
        else: raise RuntimeError('PostgreSQL did not become ready')
        schema=directory/'schema.sql'
        with schema.open('w') as out:
            docker('run','--rm','--network=none','--read-only','--entrypoint=python','-w','/app',
                '-e','APP_ENV=test','-e','PYTHONDONTWRITEBYTECODE=1','-e','DATABASE_URL=postgresql://test@127.0.0.1/sneepcut_integration_test',
                '-v',str(ROOT/'backend/alembic')+':/app/alembic:ro','-v',str(ROOT/'backend/alembic.ini')+':/app/alembic.ini:ro',
                '-v',str(ROOT/'backend/app')+':/app/app:ro','sneepcut-api','-m','alembic','upgrade','head','--sql',stdout=out)
        with schema.open() as source:
            docker('exec','-i',name+'-postgres','psql','-v','ON_ERROR_STOP=1','-U','test','-d','sneepcut_integration_test',stdin=source,stdout=subprocess.DEVNULL)
        env={'GO_AUTH_ENABLED':'true','APP_ENV':'test','LISTEN_ADDR':':8080','DATABASE_URL':'postgresql://test:local-test-only@postgres:5432/sneepcut_integration_test?sslmode=disable','REDIS_URL':'redis://redis:6379/0','JWT_SECRET':'synthetic-browser-jwt-secret-never-for-production','INTERNAL_API_KEY':'synthetic-browser-media-secret-never-for-production','UPLOAD_TOKEN_SECRET':'synthetic-browser-upload-secret-never-for-production','APP_URL':base,'CORS_ORIGINS':base,'ALLOWED_HOSTS':'127.0.0.1,localhost,backend-go,nginx,frontend','LOCAL_MEDIA_ROOT':'/app/media','UPLOAD_SCANNER_ENABLED':'false','MAX_UPLOAD_SIZE_MB':'8','DEFAULT_FREE_CREDITS':'100'}
        args=[]
        for key,value in env.items(): args += ['-e',key+'='+value]
        docker('run','--rm','-d','--name',name+'-api','--network',name,'--network-alias','backend-go',
               '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','10001:10001',
               '--tmpfs','/tmp:uid=10001,gid=10001,mode=1770','-v',name+'-media:/app/media',*args,'sneepcut-go:migration-check',stdout=subprocess.DEVNULL)
        docker('run','--rm','-d','--name',name+'-frontend','--network',name,'--network-alias','frontend',
               '-e','GO_API_URL=http://backend-go:8080','-e','MEDIA_PROXY_HOST=http://nginx:80',
               'sneepcut-frontend:go-migration-check',stdout=subprocess.DEVNULL)
        shutil.copyfile(ROOT/'nginx/nginx.conf',directory/'nginx.conf')
        docker('run','--rm','-d','--name',name+'-nginx','--network',name,'--network-alias','nginx',
               '-p',f'127.0.0.1:{port}:80','-v',str(directory/'nginx.conf')+':/etc/nginx/nginx.conf:ro',
               '-v',name+'-media:/app/media:ro','nginx:alpine',stdout=subprocess.DEVNULL)
        for _ in range(100):
            try:
                with urllib.request.urlopen(base+'/api/ready',timeout=1) as response:
                    assert json.load(response)['ready'];break
            except (OSError,AssertionError):time.sleep(.2)
        else:raise RuntimeError('Go/Nginx readiness failed')
        return state,state_path
    except:
        for suffix in ('api','frontend','nginx'):
            subprocess.run(['docker','logs',name+'-'+suffix],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        stop(state)
        raise

def verify(state):
    base=state['base'];jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));token=None
    def request(path,body=None,method=None,expected=200):
        nonlocal token
        time.sleep(.13)
        headers={'Origin':base,'Content-Type':'application/json'}
        if token:headers['Authorization']='Bearer '+token
        req=urllib.request.Request(base+path,None if body is None else json.dumps(body).encode(),headers,method=method)
        try:response=client.open(req,timeout=20)
        except urllib.error.HTTPError as error:response=error
        with response:
            raw=response.read();assert response.status==expected,(path,response.status,raw[:600])
            return json.loads(raw) if raw else None
    created=request('/v1/auth/register',{'email':state['email'],'password':state['password'],'name':'Browser Fixture'},expected=201)
    assert created['user']['credits']==100
    login=request('/v1/auth/login',{'email':state['email'],'password':state['password']},expected=201);token=login['access_token']
    assert request('/v1/auth/me')['user']['id']==created['user']['id']
    # Only the dedicated fixture database/volume is seeded. Real Go readers
    # mint the media URLs; Nginx must authorize them and serve byte ranges.
    owner = str(uuid.UUID(created['user']['id']))
    job_id, clip_id = str(uuid.uuid4()), str(uuid.uuid4())
    directory = Path(state['directory'])
    directory.chmod(0o755)
    video, thumbnail = directory/'video.mp4', directory/'thumbnail.jpg'
    run('ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24',
        '-t','4','-an','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',str(video))
    run('ffmpeg','-v','error','-y','-i',str(video),'-frames:v','1',str(thumbnail))
    copy_script = f"""from pathlib import Path
import shutil
target=Path('/app/media/clips/{job_id}')
target.mkdir(parents=True,exist_ok=True)
for name in ('video.mp4','thumbnail.jpg'): shutil.copyfile('/fixture/'+name,target/name)
"""
    docker('run','--rm','--network=none','--user','10001:10001','--entrypoint','python',
           '-v',state['name']+'-media:/app/media','-v',str(directory)+':/fixture:ro',
           'sneepcut-api','-c',copy_script)
    key = f'clips/{job_id}/video.mp4'
    thumb_key = f'clips/{job_id}/thumbnail.jpg'
    sql = f"""INSERT INTO jobs(id,user_id,source_type,status,source_storage_key,progress,num_clips_requested,aspect_ratio,subtitle_style,include_brand,credits_charged)
      VALUES('{job_id}','{owner}','upload','completed','{key}',100,1,'16:9','default',false,0);
    INSERT INTO clips(id,user_id,job_id,title,viral_score,start_time,end_time,duration,file_path,file_storage_key,thumbnail_path,thumbnail_storage_key,resolution,file_size,aspect_ratio,has_subtitles)
      VALUES('{clip_id}','{owner}','{job_id}','Runtime playback fixture',8,0,4,4,'{key}','{key}','{thumb_key}','{thumb_key}','320x180',{video.stat().st_size},'16:9',false);"""
    docker('exec','-i',state['name']+'-postgres','psql','-v','ON_ERROR_STOP=1','-U','test','-d','sneepcut_integration_test',input=sql,stdout=subprocess.DEVNULL)
    clip = request('/api/clips/'+clip_id)
    with urllib.request.urlopen(urllib.request.Request(clip['file_url'],headers={'Range':'bytes=0-127'}),timeout=10) as response:
        assert response.status==206 and len(response.read())==128
        assert response.headers['Content-Range'].startswith('bytes 0-127/')
    with urllib.request.urlopen(clip['thumbnail_url'],timeout=10) as response:
        assert response.status==200 and response.headers['Content-Type']=='image/jpeg'
    for invalid in (clip['file_url'].split('?')[0],clip['file_url']+'tampered'):
        try:
            urllib.request.urlopen(invalid,timeout=10)
            raise AssertionError('unsigned/tampered media URL accepted')
        except urllib.error.HTTPError as error:assert error.code==403
    state.update({'clipId':clip_id,'jobId':job_id})
    print('PASS: actual Go-signed clip/thumbnail URLs, Nginx byte ranges and unsigned/tampered rejection.')
    assert request('/api/dashboard')['metrics']['credits']==100
    request('/api/user/profile',{'name':'Verified Go Fixture'},'PATCH')
    for path in ('/api/dashboard/analytics','/api/jobs','/api/clips','/api/clips/library','/api/dashboard/history','/api/dashboard/review','/api/user/profile','/api/user/credits','/api/user/brand','/api/stripe/billing','/api/assistant/history?context=create','/api/user/data'):
        request(path)
    request('/api/user/brand',{'primaryColor':'#123456'},'PUT')
    request('/api/calendar?start=2026-09-01T00:00:00Z&end=2026-10-01T00:00:00Z')
    request('/api/scripts/generate',{'topic':'Fixture topic'},expected=503)
    request('/api/assistant/chat',{'context':'create','message':'Hello'},expected=503)
    refreshed=request('/v1/auth/refresh',{});assert refreshed['authenticated_at']==login['authenticated_at'];token=refreshed['access_token']
    request('/v1/auth/logout',{},expected=200)
    token=None
    request('/v1/auth/refresh',{},expected=401)
    for path in ('/login','/register','/dashboard','/ro/login'):
        with urllib.request.urlopen(base+path,timeout=30) as response:assert response.status==200
    print('PASS: production Next.js/Nginx/Go with real PostgreSQL/Redis; registration/login/refresh/logout, owned feature readers, profile/brand writes, unavailable provider errors and public pages.')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--keep',action='store_true');parser.add_argument('--stop',type=Path);args=parser.parse_args()
    if args.stop:stop(json.loads(args.stop.read_text()));return
    state,path=start()
    verified = False
    try:
        verify(state)
        verified = True
        path.write_text(json.dumps(state,indent=2)+'\n')
        if args.keep:print('BROWSER_FIXTURE_STATE='+str(path));print('BROWSER_FIXTURE_URL='+state['base'])
    finally:
        if not args.keep or not verified:stop(state)
if __name__=='__main__':main()
