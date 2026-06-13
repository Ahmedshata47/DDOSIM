import os
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.preprocessing import LabelEncoder, StandardScaler
import joblib
import warnings
warnings.filterwarnings('ignore')

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
TRAIN_FILE = os.path.join(DATA_DIR, 'cic_train.csv')

def train_real_model():
    if not os.path.exists(TRAIN_FILE):
        print("[!] cic_train.csv not found. Run data/prepare.py first.")
        return False

    # Find label column from first chunk
    chunk0 = pd.read_csv(TRAIN_FILE, nrows=1)
    label_col = None
    for c in chunk0.columns:
        if c.lower().strip() == 'label':
            label_col = c
            break
    if label_col is None:
        print("[!] No label column found")
        return False

    feature_cols = [c for c in chunk0.columns if c != label_col]
    print(f"[*] Features: {len(feature_cols)}, loading stratified sample...")

    # Count label distribution first
    label_counts = {}
    for chunk in pd.read_csv(TRAIN_FILE, usecols=[label_col], chunksize=500000):
        for lbl, cnt in chunk[label_col].astype(str).value_counts().items():
            label_counts[lbl] = label_counts.get(lbl, 0) + cnt
    print(f"    Label distribution: {label_counts}")

    # Sample up to 15000 rows per class (stratified across chunks)
    samples = {}
    for chunk in pd.read_csv(TRAIN_FILE, low_memory=False, chunksize=500000):
        chunk[label_col] = chunk[label_col].astype(str)
        for lbl in list(label_counts.keys()):
            mask = chunk[label_col] == lbl
            sub = chunk[mask]
            if len(sub) == 0:
                continue
            already = len(samples.get(lbl, pd.DataFrame()))
            remaining = 15000 - already
            if remaining <= 0:
                continue
            n_take = min(remaining, len(sub))
            if lbl in samples:
                samples[lbl] = pd.concat([samples[lbl], sub.sample(n=n_take, random_state=42)])
            else:
                samples[lbl] = sub.sample(n=n_take, random_state=42)

    df = pd.concat(list(samples.values()), ignore_index=True)
    print(f"    Sampled {len(df)} rows for training")

    # Clean
    for c in feature_cols:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=feature_cols)

    le = LabelEncoder()
    df['label_encoded'] = le.fit_transform(df[label_col].astype(str))

    X = df[feature_cols].values.astype(np.float32)
    y = df['label_encoded'].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    n_classes = len(le.classes_)
    print(f"    Classes: {list(le.classes_)} ({n_classes} total)")

    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, random_state=42, stratify=y
    )

    print("[*] Training Random Forest...")
    n_jobs = max(1, os.cpu_count() - 1) if os.cpu_count() else 1
    rf = RandomForestClassifier(
        n_estimators=100, max_depth=20, random_state=42, n_jobs=n_jobs, class_weight='balanced'
    )
    rf.fit(X_train, y_train)

    y_pred = rf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted')
    print(f"[OK] Random Forest - Accuracy: {acc:.4f}, F1: {f1:.4f}")

    print("[*] Training Isolation Forest...")
    iso = IsolationForest(contamination=0.3, random_state=42, n_jobs=n_jobs)
    iso.fit(X_train)

    joblib.dump(rf, os.path.join(MODEL_DIR, 'ddos_rf_real.pkl'))
    joblib.dump(iso, os.path.join(MODEL_DIR, 'ddos_if_real.pkl'))
    joblib.dump(scaler, os.path.join(MODEL_DIR, 'scaler_real.pkl'))
    joblib.dump(le, os.path.join(MODEL_DIR, 'le_real.pkl'))

    config = {
        'features': feature_cols,
        'n_features': len(feature_cols),
        'n_classes': n_classes,
        'classes': list(le.classes_),
        'accuracy': float(acc),
        'f1_score': float(f1),
        'label_column': label_col,
    }
    with open(os.path.join(MODEL_DIR, 'model_real_config.json'), 'w') as f:
        json.dump(config, f, indent=2)

    importance_df = pd.DataFrame({
        'feature': feature_cols,
        'importance': rf.feature_importances_
    }).sort_values('importance', ascending=False)

    print("\n[*] Top 15 features:")
    for _, row in importance_df.head(15).iterrows():
        print(f"    {row['feature']}: {row['importance']:.4f}")

    print(f"\n[OK] Real models saved to {MODEL_DIR} with {len(feature_cols)} features")
    return True

if __name__ == '__main__':
    train_real_model()
