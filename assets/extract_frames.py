import cv2
from pathlib import Path

src = Path(r"C:\Users\ber\Desktop\aviator\assets\ref-flight.mp4")
out = Path(r"C:\Users\ber\Desktop\aviator\assets\frames")
out.mkdir(parents=True, exist_ok=True)

cap = cv2.VideoCapture(str(src))
fps = cap.get(cv2.CAP_PROP_FPS) or 30
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
dur = n / fps if fps else 0
print(f"fps={fps:.2f} frames={n} size={w}x{h} dur={dur:.2f}s")

targets = 14
indices = [int(i * (n - 1) / (targets - 1)) for i in range(targets)] if n > 1 else [0]
saved = []
for idx in indices:
    cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
    ok, frame = cap.read()
    if not ok:
        continue
    t = idx / fps
    path = out / f"frame_{len(saved):02d}_t{t:05.2f}s.png"
    cv2.imwrite(str(path), frame)
    saved.append((path.name, t, frame.shape))

cap.release()
print("saved", len(saved))
for name, t, shape in saved:
    print(name, f"{t:.2f}s", shape)
