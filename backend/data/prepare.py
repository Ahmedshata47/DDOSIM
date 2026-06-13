import os
import zipfile
import glob
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(DATA_DIR, 'cic_raw')
PROCESSED_DIR = DATA_DIR

TRAIN_FILE = os.path.join(PROCESSED_DIR, 'cic_train.csv')
TEST_FILE = os.path.join(PROCESSED_DIR, 'cic_test.csv')

def find_zip_files():
    patterns = [
        os.path.join(RAW_DIR, '*.zip'),
        os.path.join(RAW_DIR, '*.z01'),
        os.path.join(RAW_DIR, '*.z02'),
    ]
    files = []
    for p in patterns:
        files.extend(glob.glob(p))
    return files

def extract_dataset():
    extract_dir = os.path.join(RAW_DIR, 'extracted')
    os.makedirs(extract_dir, exist_ok=True)

    # Check if already extracted
    csv_files = glob.glob(os.path.join(extract_dir, '*_cleaned.csv'))
    if csv_files:
        print(f"[OK] Found {len(csv_files)} already-extracted CSV files in extracted/")
        return csv_files

    zip_files = find_zip_files()
    if not zip_files:
        print("[!] No zip files found in data/cic_raw/")
        print("    Download from: https://github.com/weshowe/CIC-DDoS2019_Cleaned")
        print("    Place the zip files in: data/cic_raw/")
        return False

    print("[*] Building fixed.zip from split parts...")
    # Concatenate parts in order, removing the span marker at start of z01
    ordered = ['01-12-c.z01','01-12-c.z02','01-12-c.z03','01-12-c.z04','01-12-c.z05','01-12-c.zip']
    combined = b''
    for p in ordered:
        fpath = os.path.join(RAW_DIR, p)
        if not os.path.exists(fpath):
            print(f"[!] Missing part: {p}")
            return False
        with open(fpath, 'rb') as f:
            data = f.read()
        if p == '01-12-c.z01':
            data = data[4:]  # skip 4-byte PK\x07\x08 span marker
        combined += data

    # Fix CD and EOCD offsets
    import struct
    zip_start = sum(os.path.getsize(os.path.join(RAW_DIR, p)) for p in ordered[:-1])
    zip_data = combined[zip_start - 4:]  # .zip section in the cleaned stream

    eocd_pos = combined.rfind(b'PK\x05\x06')
    cd_off_in_zip = struct.unpack_from('<I', combined, eocd_pos + 16)[0]
    cd_entries = struct.unpack_from('<H', combined, eocd_pos + 10)[0]

    # Fix EOCD: set correct absolute CD offset
    correct_cd = (zip_start - 4) + cd_off_in_zip
    combined = bytearray(combined)
    struct.pack_into('<I', combined, eocd_pos + 16, correct_cd)

    # Fix each CD entry's LFH offset (they're relative to each part, convert to absolute)
    pos = correct_cd
    for i in range(cd_entries):
        sig = combined[pos:pos+4]
        if sig != b'PK\x01\x02':
            print(f"  Bad CD sig at {pos}")
            break
        name_len = struct.unpack_from('<H', combined, pos+28)[0]
        extra_len = struct.unpack_from('<H', combined, pos+30)[0]
        comment_len = struct.unpack_from('<H', combined, pos+32)[0]
        lfh_off = struct.unpack_from('<I', combined, pos+42)[0]

        # Determine which part this LFH is in
        # Offsets are relative to each individual part start
        cumul = 0
        abs_off = None
        for p in ordered:
            part_sz = os.path.getsize(os.path.join(RAW_DIR, p))
            if p == ordered[0]:
                part_sz -= 4  # first part had 4 bytes removed
            if lfh_off < part_sz:
                abs_off = cumul + lfh_off
                break
            cumul += part_sz
            lfh_off -= part_sz

        if abs_off is not None:
            struct.pack_into('<I', combined, pos+42, abs_off)
        pos += 46 + name_len + extra_len + comment_len

    # Write fixed.zip
    fixed_path = os.path.join(RAW_DIR, 'fixed.zip')
    with open(fixed_path, 'wb') as f:
        f.write(bytes(combined))
    print(f"[OK] Written fixed.zip (combined parts -> valid zip)")

    # Extract from fixed.zip
    import zipfile
    print("[*] Extracting CSVs from fixed.zip...")
    try:
        with zipfile.ZipFile(fixed_path, 'r') as zf:
            zf.extractall(extract_dir)
        print("[OK] Extraction complete")
    except Exception as e:
        print(f"[!] Extraction from fixed.zip failed: {e}")
        print("    Falling back to sequential extraction...")
        # Sequential extraction fallback
        _extract_sequential(combined, extract_dir)

    csv_files = glob.glob(os.path.join(extract_dir, '*_cleaned.csv'))
    if not csv_files:
        csv_files = glob.glob(os.path.join(extract_dir, '**', '*.csv'), recursive=True)

    if not csv_files:
        print(f"[!] No CSV files found in {extract_dir}")
        print("    Contents:", os.listdir(extract_dir))
        return False

    print(f"[*] Found {len(csv_files)} CSV file(s)")
    return csv_files

def _extract_sequential(data, out_dir):
    """Sequential zip extraction without relying on CD offsets."""
    import struct, zlib
    pos = 0
    count = 0
    while pos < len(data) and count < 11:
        if data[pos:pos+4] == b'PK\x03\x04':
            name_len = struct.unpack_from('<H', data, pos+26)[0]
            extra_len = struct.unpack_from('<H', data, pos+28)[0]
            comp_size = struct.unpack_from('<I', data, pos+18)[0]
            uncomp_size = struct.unpack_from('<I', data, pos+22)[0]
            method = struct.unpack_from('<H', data, pos+8)[0]
            name = data[pos+30:pos+30+name_len].decode('utf-8', errors='replace')
            data_off = pos + 30 + name_len + extra_len

            if comp_size > 0 and method == 8:
                compressed = data[data_off:data_off+comp_size]
                try:
                    decompressed = zlib.decompress(compressed, -zlib.MAX_WBITS)
                    with open(os.path.join(out_dir, name), 'wb') as f:
                        f.write(decompressed)
                    count += 1
                except:
                    pass
            pos = data_off + (comp_size if comp_size > 0 else uncomp_size)
        else:
            pos += 1
    print(f"  Extracted {count} files sequentially")

def prepare_dataset(csv_files):
    CHUNK_SIZE = 200000

    # Scan first file to determine label column, feature cols, and numeric columns
    print("[*] Scanning first file to determine schema...")
    sample = pd.read_csv(csv_files[0], nrows=1000, low_memory=False)
    label_col = None
    for col in sample.columns:
        if col.strip().lower() == 'label':
            label_col = col
            break
    if label_col is None:
        print("[!] No 'Label' column found. Columns:", list(sample.columns[:20]))
        return False

    all_features = [c for c in sample.columns if c != label_col]
    # Determine numeric columns from sample
    numeric_cols = []
    for c in all_features:
        try:
            pd.to_numeric(sample[c])
            numeric_cols.append(c)
        except:
            print(f"    Dropping non-numeric column: {c}")
    print(f"    Using {len(numeric_cols)} numeric feature columns")
    use_cols = numeric_cols + [label_col]

    # Process each CSV in chunks: clean and write to train/test
    print("[*] Processing in chunks ({} rows each)...".format(CHUNK_SIZE))
    if os.path.exists(TRAIN_FILE):
        os.remove(TRAIN_FILE)
    if os.path.exists(TEST_FILE):
        os.remove(TEST_FILE)

    total_rows = 0
    cleaned_rows = 0
    first_chunk = True

    for f in csv_files:
        base = os.path.basename(f)
        print(f"    Processing {base}...")
        for chunk in pd.read_csv(f, usecols=use_cols, low_memory=False, chunksize=CHUNK_SIZE):
            total_rows += len(chunk)
            # Replace inf with NaN
            chunk = chunk.replace([np.inf, -np.inf], np.nan)
            # Drop NaN rows
            chunk = chunk.dropna(how='any')
            # Convert label to string category
            chunk[label_col] = chunk[label_col].astype(str)
            if len(chunk) == 0:
                continue

            # Simple stratified 80/20 split on each chunk
            labels = chunk[label_col].value_counts()
            train_list = []
            test_list = []
            for lbl, cnt in labels.items():
                mask = chunk[label_col] == lbl
                sub = chunk[mask]
                if len(sub) < 2:
                    train_list.append(sub)
                    continue
                # First 80% to train, last 20% to test
                split_idx = int(len(sub) * 0.8)
                train_list.append(sub.iloc[:split_idx])
                test_list.append(sub.iloc[split_idx:])

            train_chunk = pd.concat(train_list, ignore_index=True)
            test_chunk = pd.concat(test_list, ignore_index=True)

            cleaned_rows += len(train_chunk) + len(test_chunk)

            mode = 'w' if first_chunk else 'a'
            header = first_chunk
            train_chunk.to_csv(TRAIN_FILE, mode=mode, header=header, index=False)
            test_chunk.to_csv(TEST_FILE, mode=mode, header=header, index=False)
            first_chunk = False

    print(f"    Processed {total_rows} rows -> {cleaned_rows} rows after cleaning")
    print(f"[OK] Train: {sum(1 for _ in open(TRAIN_FILE)) - 1} rows -> data/cic_train.csv")
    print(f"[OK] Test:  {sum(1 for _ in open(TEST_FILE)) - 1} rows -> data/cic_test.csv")
    return True

def check_data_ready():
    return os.path.exists(TRAIN_FILE) and os.path.exists(TEST_FILE)

def get_data_info():
    if not check_data_ready():
        return None
    train_df = pd.read_csv(TRAIN_FILE, nrows=1)
    # Fast row count: use file size / avg row size estimate
    train_size = os.path.getsize(TRAIN_FILE)
    test_size = os.path.getsize(TEST_FILE)
    # Read first 1000 data rows to estimate avg row size
    sample = pd.read_csv(TRAIN_FILE, nrows=1000, low_memory=False)
    header_len = len(','.join(sample.columns)) + 1
    sample_bytes = sum(len(','.join(str(v) for v in row)) + 1 for _, row in sample.iterrows())
    avg_row = sample_bytes / 1000
    train_rows_est = int((train_size - header_len) / avg_row)
    test_rows_est = int((test_size - header_len) / avg_row)
    label_col = [c for c in train_df.columns if c.lower().strip() == 'label'][0]
    return {
        'ready': True,
        'train_rows': train_rows_est,
        'test_rows': test_rows_est,
        'features': [c for c in train_df.columns if c != label_col],
        'label_column': label_col,
    }

if __name__ == '__main__':
    print("=== CIC-DDoS2019 Dataset Preparation ===\n")

    if check_data_ready():
        info = get_data_info()
        print(f"[✓] Data already prepared: {info['train_rows']} train, {info['test_rows']} test rows")
        import sys
        sys.exit(0)

    csv_files = extract_dataset()
    if not csv_files:
        print("\nTo download the dataset:")
        print("1. Go to https://github.com/weshowe/CIC-DDoS2019_Cleaned/tree/main/01-12")
        print("2. Download 01-12-c.zip, 01-12-c.z01, 01-12-c.z02, 01-12-c.z03, 01-12-c.z04, 01-12-c.z05")
        print("3. Place all files in: data/cic_raw/")
        print("4. Run this script again")
        import sys
        sys.exit(1)

    prepare_dataset(csv_files)
