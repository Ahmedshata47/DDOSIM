import asyncio
import json
import uuid
import time
from collections import deque
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from model.predict_real import is_real_model_ready
from engine.replay import ReplayEngine
from data.prepare import check_data_ready, get_data_info

app = FastAPI(title="DDoSim Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    print("[OK] Backend ready - using real CIC-DDoS2019 data")

@app.get("/api/status")
async def status():
    return {"status": "ok", "model_loaded": is_real_model_ready()}

@app.get("/api/data_status")
async def data_status():
    ready = check_data_ready()
    if ready:
        info = get_data_info()
        if info:
            info['real_model_ready'] = is_real_model_ready()
            return info
    return {"ready": False, "real_model_ready": False}

replay_engine = ReplayEngine()

@app.websocket("/ws/replay")
async def replay_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = str(uuid.uuid4())[:8]
    print(f"[{client_id}] Replay client connected")

    running = True
    paused = False
    model_type = 'rf'
    speed = 1.0
    packet_count = 0
    attack_active = False
    ip_attack_count = {}
    blocked_ips = set()
    stats = {
        'total_packets': 0, 'attack_packets': 0, 'benign_packets': 0,
        'attack_rate': 0, 'dropped_packets': 0,
        'confidence_history': [], 'traffic_history': [],
    }

    try:
        data = await websocket.receive_json()
        model_type = 'rf'
        speed = data.get('packet_rate', 100) / 100.0
        attack_types = data.get('attack_types', None)
        mitigation = data.get('mitigation', False)

        if not replay_engine.check_ready():
            await websocket.send_json({
                'type': 'error',
                'message': 'Test dataset not found. Run data/prepare.py first.',
            })
            return

        if not is_real_model_ready():
            await websocket.send_json({
                'type': 'error',
                'message': 'Real model not trained. Run train_real.py first.',
            })
            return

        if attack_types:
            replay_engine.set_label_filter(attack_types)

        stats_info = replay_engine.get_stats()
        print(f"[{client_id}] Replay started: {stats_info['total_rows']} rows available, speed {speed}x, filter={attack_types}")

        await websocket.send_json({
            'type': 'simulation_started',
            'mode': 'replay',
            'total_rows': stats_info['total_rows'],
            'server': {'id': 'server', 'ip': '172.16.0.1'},
            'router': {'id': 'router', 'ip': '10.0.0.254'},
        })

        packet_stream = replay_engine.stream_test_rows(model_type, speed)

        while running:
            if paused:
                await asyncio.sleep(0.1)
                try:
                    ctrl = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                    if ctrl.get('type') == 'resume':
                        paused = False
                except (asyncio.TimeoutError, json.JSONDecodeError):
                    pass
                continue

            try:
                packet_event = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: next(packet_stream)
                )
            except StopIteration:
                await websocket.send_json({
                    'type': 'alert',
                    'message': 'Replay complete - all test rows streamed',
                })
                break

            if packet_event.get('type') == 'error':
                await websocket.send_json(packet_event)
                continue

            packet_count += 1
            src_ip = packet_event.get('source', '')
            is_attack = packet_event.get('is_attack_predicted', False)

            dropped = False
            if mitigation and is_attack:
                ip_attack_count[src_ip] = ip_attack_count.get(src_ip, 0) + 1
                if ip_attack_count[src_ip] >= 5:
                    blocked_ips.add(src_ip)
                if src_ip in blocked_ips:
                    dropped = True
                    packet_event['dropped'] = True
                    stats['dropped_packets'] = stats.get('dropped_packets', 0) + 1

            if not dropped:
                stats['total_packets'] += 1
                if is_attack:
                    stats['attack_packets'] += 1
                else:
                    stats['benign_packets'] += 1
            stats['attack_rate'] = round(
                (stats['attack_packets'] / max(stats['total_packets'], 1)) * 100, 1
            )
            stats['confidence_history'].append(packet_event.get('confidence', 0))
            if len(stats['confidence_history']) > 100:
                stats['confidence_history'] = stats['confidence_history'][-100:]
            stats['traffic_history'].append({
                'time': packet_count,
                'total': stats['total_packets'],
                'attack': stats['attack_packets'],
                'confidence': packet_event.get('confidence', 0),
            })
            if len(stats['traffic_history']) > 200:
                stats['traffic_history'] = stats['traffic_history'][-200:]

            await websocket.send_json(packet_event)

            if stats['attack_rate'] > 70 and not attack_active:
                attack_active = True
                await websocket.send_json({
                    'type': 'alert',
                    'message': 'REAL ATTACK DETECTED in replay data!',
                    'attack_rate': stats['attack_rate'],
                })
            elif stats['attack_rate'] < 30 and attack_active:
                attack_active = False
                await websocket.send_json({
                    'type': 'alert',
                    'message': 'Normal traffic resumed in replay',
                    'attack_rate': stats['attack_rate'],
                })

            total_reached = max(stats['total_packets'], 1)
            await websocket.send_json({
                'type': 'stats',
                'stats': {
                    'total_packets': stats['total_packets'],
                    'attack_packets': stats['attack_packets'],
                    'benign_packets': stats['benign_packets'],
                    'attack_rate': stats['attack_rate'],
                    'avg_confidence': round(
                        sum(stats['confidence_history']) / max(len(stats['confidence_history']), 1), 4
                    ),
                    'mitigation': mitigation,
                    'dropped_packets': stats.get('dropped_packets', 0),
                    'blocked_ips': len(blocked_ips),
                    'mitigation_effectiveness': round(
                        (stats.get('dropped_packets', 0) / max(stats['attack_packets'] + stats.get('dropped_packets', 0), 1)) * 100, 1
                    ),
                }
            })

            delay = 1.0 / max(speed * 10, 1)
            await asyncio.sleep(delay)

            try:
                ctrl = await asyncio.wait_for(websocket.receive_json(), timeout=0.001)
                if ctrl.get('type') == 'pause':
                    paused = True
                elif ctrl.get('type') == 'resume':
                    paused = False
                elif ctrl.get('type') == 'stop':
                    running = False
            except asyncio.TimeoutError:
                pass
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        print(f"[{client_id}] Replay client disconnected")
    except Exception as e:
        print(f"[{client_id}] Replay error: {e}")
    finally:
        print(f"[{client_id}] Replay ended ({packet_count} packets)")
        try:
            await websocket.close()
        except Exception:
            pass

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
