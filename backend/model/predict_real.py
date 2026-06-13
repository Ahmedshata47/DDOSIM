import numpy as np
import joblib
import os
import json
import warnings
warnings.filterwarnings('ignore')

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

_config = None
_models = {}

def load_real_config():
    global _config
    if _config is None:
        config_path = os.path.join(MODEL_DIR, 'model_real_config.json')
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                _config = json.load(f)
    return _config

def load_real_models():
    if 'rf' not in _models:
        config = load_real_config()
        if not config:
            return False
        try:
            _models['rf'] = joblib.load(os.path.join(MODEL_DIR, 'ddos_rf_real.pkl'))
            _models['if'] = joblib.load(os.path.join(MODEL_DIR, 'ddos_if_real.pkl'))
            _models['scaler'] = joblib.load(os.path.join(MODEL_DIR, 'scaler_real.pkl'))
            _models['le'] = joblib.load(os.path.join(MODEL_DIR, 'le_real.pkl'))
            _models['features'] = config['features']
            _models['loaded'] = True
        except FileNotFoundError:
            _models['loaded'] = False
    return _models['loaded']

def predict_real(features_dict, model_type='rf'):
    if not load_real_models():
        return {
            'error': 'Real models not trained yet',
            'prediction': 'unknown',
            'confidence': 0,
            'is_attack': False,
        }

    feature_names = _models['features']
    feature_vector = np.array([features_dict.get(f, 0.0) for f in feature_names]).reshape(1, -1)
    feature_vector = np.nan_to_num(feature_vector, nan=0.0, posinf=0.0, neginf=0.0)

    scaler = _models['scaler']
    le = _models['le']

    feature_vector_scaled = scaler.transform(feature_vector)

    if model_type == 'rf':
        model = _models['rf']
        proba = model.predict_proba(feature_vector_scaled)[0]
        pred_encoded = int(np.argmax(proba))
        confidence = float(np.max(proba))
        pred_label = le.inverse_transform([pred_encoded])[0]
        is_attack = pred_label.upper() != 'BENIGN'
        importances = model.feature_importances_
    else:
        model = _models['if']
        pred_raw = int(model.predict(feature_vector_scaled)[0])
        score = float(model.score_samples(feature_vector_scaled)[0])
        is_attack = pred_raw == -1
        if is_attack:
            pred_label = 'SYN Flood'
            confidence = min(1.0, float(abs(score) / 5))
        else:
            pred_label = 'BENIGN'
            confidence = max(0.5, 1.0 - float(abs(score) / 10))
        importances = np.zeros(len(feature_names))

    n_top = min(10, len(feature_names))
    top_indices = np.argsort(np.abs(importances))[-n_top:][::-1]
    feature_importance = []
    for idx in top_indices:
        feature_importance.append({
            'feature': feature_names[idx],
            'value': float(feature_vector[0, idx]),
            'importance': float(importances[idx]),
        })

    return {
        'prediction': pred_label,
        'confidence': confidence,
        'is_attack': is_attack,
        'features': {feature_names[i]: float(feature_vector[0, i]) for i in range(len(feature_names))},
        'feature_importance': feature_importance,
        'model_used': 'Random Forest (Real)' if model_type == 'rf' else 'Isolation Forest (Real)',
    }

def is_real_model_ready():
    config = load_real_config()
    if not config:
        return False
    return load_real_models()
