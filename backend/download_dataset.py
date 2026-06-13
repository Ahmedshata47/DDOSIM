import os
import sys
import io
import requests
from tqdm import tqdm

# Force UTF-8 for stdout to handle special chars on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

RAW_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cic_raw')
os.makedirs(RAW_DIR, exist_ok=True)

FILES = [
    '01-12-c.z01',
    '01-12-c.z02',
    '01-12-c.z03',
    '01-12-c.z04',
    '01-12-c.z05',
    '01-12-c.zip',
]

API_BASE = 'https://api.github.com/repos/weshowe/CIC-DDoS2019_Cleaned/contents/01-12'

def get_download_url(filename):
    r = requests.get(f'{API_BASE}/{filename}')
    if r.status_code == 200:
        return r.json()['download_url']
    elif r.status_code == 404:
        print(f'  [!!] File not found on GitHub: {filename}')
        # List directory contents for debugging
        if filename == FILES[0]:
            try:
                dir_r = requests.get(API_BASE)
                if dir_r.status_code == 200:
                    items = [item['name'] for item in dir_r.json()]
                    print(f'  Available files: {items}')
                else:
                    print(f'  Dir list failed: {dir_r.status_code}')
            except Exception as e:
                print(f'  Dir list error: {e}')
        return None
    else:
        print(f'  [!!] API error {r.status_code} for {filename}')
        return None

def download_file(url, dest_path):
    r = requests.get(url, stream=True)
    total = int(r.headers.get('content-length', 0))
    with open(dest_path, 'wb') as f, tqdm(
        desc=os.path.basename(dest_path),
        total=total,
        unit='B',
        unit_scale=True,
        unit_divisor=1024,
    ) as pbar:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
                pbar.update(len(chunk))

def main():
    print('=== Downloading CIC-DDoS2019 Cleaned Dataset ===')
    print(f'Destination: {RAW_DIR}')
    print()

    for filename in FILES:
        dest = os.path.join(RAW_DIR, filename)
        if os.path.exists(dest):
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f'[OK] Already exists: {filename} ({size_mb:.0f} MB)')
            continue

        print(f'[..] Getting download URL for {filename}...')
        url = get_download_url(filename)
        if not url:
            print(f'  [!!] Skipping {filename}')
            continue

        print(f'[..] Downloading {filename}...')
        try:
            download_file(url, dest)
            size_mb = os.path.getsize(dest) / (1024 * 1024)
            print(f'[OK] Downloaded: {filename} ({size_mb:.0f} MB)')
        except Exception as e:
            print(f'[!!] Failed: {e}')
            if os.path.exists(dest):
                os.remove(dest)
            continue

    print()
    print('=== Download complete ===')
    total = sum(os.path.getsize(os.path.join(RAW_DIR, f)) for f in os.listdir(RAW_DIR) if os.path.isfile(os.path.join(RAW_DIR, f)))
    print(f'Total: {total / (1024*1024*1024):.2f} GB')

if __name__ == '__main__':
    main()
