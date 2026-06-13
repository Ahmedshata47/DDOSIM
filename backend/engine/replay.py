import os
import csv
import random
import time
import json
import pandas as pd
from model.predict_real import predict_real

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
TEST_FILE = os.path.join(DATA_DIR, 'cic_test.csv')

class ReplayEngine:
    def __init__(self, test_file=TEST_FILE):
        self.test_file = test_file
        self.label_col = None
        self.feature_cols = None
        self.label_filter = None
        self._detect_columns()

    def _detect_columns(self):
        if not os.path.exists(self.test_file):
            raise FileNotFoundError(f"Test file not found: {self.test_file}")
        with open(self.test_file, 'r') as f:
            reader = csv.reader(f)
            headers = next(reader)
        self.label_col = None
        for c in headers:
            if c.lower().strip() == 'label':
                self.label_col = c
                break
        if not self.label_col:
            raise ValueError("No 'Label' column found in test CSV")
        self.feature_cols = [c for c in headers if c != self.label_col]

    def set_label_filter(self, allowed_labels):
        self.label_filter = set(allowed_labels)

    def get_stats(self):
        if not os.path.exists(self.test_file):
            return None
        total = sum(1 for _ in open(self.test_file)) - 1
        return {
            'total_rows': total,
            'feature_count': len(self.feature_cols) if self.feature_cols else 0,
            'ready': True,
        }

    def stream_test_rows(self, model_type='rf', speed=1.0):
        attack_sources = [
            f'192.168.1.{i}' for i in range(2, 102)
        ]
        benign_sources = [
            f'10.0.0.{i}' for i in range(2, 52)
        ]
        server_ip = '172.16.0.1'

        packet_count = 0

        for chunk_df in pd.read_csv(self.test_file, chunksize=50000, low_memory=False):
            if self.label_filter is not None:
                chunk_df = chunk_df[chunk_df[self.label_col].astype(str).isin(self.label_filter)]

            if len(chunk_df) == 0:
                continue

            chunk_df = chunk_df.replace([float('inf'), float('-inf')], 0).fillna(0)
            chunk_df = chunk_df.sample(frac=1)

            for _, row in chunk_df.iterrows():
                try:
                    features = {}
                    for col in self.feature_cols:
                        try:
                            features[col] = float(row[col])
                        except (ValueError, TypeError):
                            features[col] = 0.0

                    true_label = str(row[self.label_col])
                    is_attack_real = true_label.upper() != 'BENIGN'
                    result = predict_real(features, model_type)

                    if is_attack_real:
                        src_ip = random.choice(attack_sources)
                        src_id = f'bot_{random.randint(0, 99)}'
                    else:
                        src_ip = random.choice(benign_sources)
                        src_id = f'client_{random.randint(0, 49)}'

                    packet_count += 1

                    yield {
                        'type': 'packet',
                        'packet_id': f'replay_{packet_count}',
                        'timestamp': time.time(),
                        'source': src_ip,
                        'source_id': src_id,
                        'destination': server_ip,
                        'destination_id': 'server',
                        'features': features,
                        'prediction': result.get('prediction', 'unknown'),
                        'confidence': result.get('confidence', 0),
                        'is_attack_predicted': result.get('is_attack', False),
                        'is_actual_attack': is_attack_real,
                        'true_label': true_label,
                        'feature_importance': result.get('feature_importance', [])[:5],
                        'model_used': result.get('model_used', 'Random Forest'),
                        'replay': True,
                    }
                except Exception as e:
                    yield {'type': 'error', 'message': f'Replay error: {str(e)}'}

    def check_ready(self):
        return os.path.exists(self.test_file)
